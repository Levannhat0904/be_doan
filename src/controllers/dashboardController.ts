import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

// Get dashboard summary statistics
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    // Get total students count
    const [studentsResult] = await pool.query<RowDataPacket[]>(
      `SELECT 
        COUNT(*) as totalStudents,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as activeStudents,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingStudents
      FROM students`
    );

    // Get rooms and occupancy stats - using contracts to count occupancy
    const [roomsResult] = await pool.query<RowDataPacket[]>(
      `SELECT 
        COUNT(*) as totalRooms,
        COUNT(CASE WHEN status = 'available' AND currentOccupancy < capacity THEN 1 END) as availableRooms,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenanceRooms,
        ROUND(SUM(currentOccupancy) / SUM(capacity) * 100) as occupancyRate
      FROM rooms`
    );

    // Get pending maintenance requests
    const [maintenanceResult] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as pendingRequests
       FROM maintenance_requests
       WHERE status = 'pending'`
    );

    // Get current month's revenue
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
    const currentYear = currentDate.getFullYear();
    
    const [revenueResult] = await pool.query<RowDataPacket[]>(
      `SELECT SUM(totalAmount) as monthlyRevenue
       FROM invoices
       WHERE MONTH(invoiceMonth) = ? AND YEAR(invoiceMonth) = ?`,
      [currentMonth, currentYear]
    );

    const dashboardData = {
      totalStudents: studentsResult[0].totalStudents || 0,
      activeStudents: studentsResult[0].activeStudents || 0,
      pendingStudents: studentsResult[0].pendingStudents || 0,
      availableRooms: roomsResult[0].availableRooms || 0,
      totalRooms: roomsResult[0].totalRooms || 0,
      maintenanceRooms: roomsResult[0].maintenanceRooms || 0,
      occupancyRate: roomsResult[0].occupancyRate || 0,
      pendingRequests: maintenanceResult[0].pendingRequests || 0,
      monthlyRevenue: revenueResult[0].monthlyRevenue || 0
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
};

// Get monthly statistics for the charts
export const getMonthlyStats = async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Get revenue by month for the specified year
    const [revenueData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        MONTH(invoiceMonth) as month,
        SUM(totalAmount) as revenue
       FROM invoices
       WHERE YEAR(invoiceMonth) = ?
       GROUP BY MONTH(invoiceMonth)
       ORDER BY MONTH(invoiceMonth)`,
      [year]
    );

    // Get student count by month based on active contracts
    const [studentData] = await pool.query<RowDataPacket[]>(
      `WITH RECURSIVE months(m) AS (
        SELECT 1 UNION ALL SELECT m+1 FROM months WHERE m < 12
      )
      SELECT 
        m.m as month,
        COUNT(DISTINCT c.studentId) as students
      FROM months m
      LEFT JOIN contracts c ON 
        ? BETWEEN YEAR(c.startDate) AND YEAR(c.endDate)
        AND m.m BETWEEN MONTH(
          IF(YEAR(c.startDate) < ?, '${year}-01-01', c.startDate)
        ) AND MONTH(
          IF(YEAR(c.endDate) > ?, '${year}-12-31', c.endDate)
        )
      GROUP BY m.m
      ORDER BY m.m`,
      [year, year, year]
    );

    // Combine the data for the response
    const monthlyData = [];
    for (let i = 1; i <= 12; i++) {
      const revenueItem = revenueData.find(item => parseInt(item.month) === i);
      const studentItem = studentData.find(item => parseInt(item.month) === i);

      monthlyData.push({
        month: i.toString(),
        revenue: revenueItem ? Number(revenueItem.revenue) : 0,
        students: studentItem ? parseInt(studentItem.students) : 0
      });
    }

    res.status(200).json(monthlyData);
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ message: 'Error fetching monthly statistics' });
  }
};

// Get yearly statistics for the charts
export const getYearlyStats = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 4; // Last 5 years

    // Get yearly revenue data
    const [revenueData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        YEAR(invoiceMonth) as year,
        SUM(totalAmount) as revenue
       FROM invoices
       WHERE YEAR(invoiceMonth) >= ?
       GROUP BY YEAR(invoiceMonth)
       ORDER BY year`,
      [startYear]
    );

    // Get yearly student count data based on contracts
    // Count unique students who had an active contract at any point during each year
    const [studentData] = await pool.query<RowDataPacket[]>(
      `WITH RECURSIVE years(y) AS (
        SELECT ? UNION ALL SELECT y+1 FROM years WHERE y < ?
      )
      SELECT 
        y.y as year,
        COUNT(DISTINCT c.studentId) as students
      FROM years y
      LEFT JOIN contracts c ON 
        y.y BETWEEN YEAR(c.startDate) AND YEAR(c.endDate)
      GROUP BY y.y
      ORDER BY y.y`,
      [startYear, currentYear]
    );

    // Combine the data for the response
    const yearlyData = [];
    for (let year = startYear; year <= currentYear; year++) {
      const revenueItem = revenueData.find(item => parseInt(item.year) === year);
      const studentItem = studentData.find(item => parseInt(item.year) === year);

      yearlyData.push({
        year: year.toString(),
        revenue: revenueItem ? Number(revenueItem.revenue) : 0,
        students: studentItem ? parseInt(studentItem.students) : 0
      });
    }

    res.status(200).json(yearlyData);
  } catch (error) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ message: 'Error fetching yearly statistics' });
  }
};

// Get occupancy data for the pie charts
export const getOccupancyStats = async (req: Request, res: Response) => {
  try {
    // Get room occupancy stats based on current occupancy
    const [roomOccupancy] = await pool.query<RowDataPacket[]>(
      `SELECT 
         SUM(currentOccupancy) as occupied,
         SUM(capacity - currentOccupancy) as available
       FROM rooms
       WHERE status != 'maintenance'`
    );

    // Get gender distribution of students with active contracts
    const [genderDistribution] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.gender,
         COUNT(*) as count
       FROM students s
       INNER JOIN contracts c ON s.id = c.studentId
       WHERE c.status = 'active'
       GROUP BY s.gender`
    );

    // Calculate percentages for occupancy pie chart
    const totalCapacity = Number(roomOccupancy[0].occupied) + Number(roomOccupancy[0].available) || 0;
    const occupied = Number(roomOccupancy[0].occupied) || 0;
    const available = Number(roomOccupancy[0].available) || 0;

    const occupancyData = [
      {
        name: "Đã sử dụng",
        value: totalCapacity > 0 ? Math.round(occupied / totalCapacity * 100) : 0
      },
      {
        name: "Còn trống",
        value: totalCapacity > 0 ? Math.round(available / totalCapacity * 100) : 0
      }
    ];

    // Format gender distribution data
    const maleCount = genderDistribution.find(item => item.gender === 'male')?.count || 0;
    const femaleCount = genderDistribution.find(item => item.gender === 'female')?.count || 0;
    const otherCount = genderDistribution.find(item => item.gender === 'other')?.count || 0;
    const totalStudents = maleCount + femaleCount + otherCount;

    const genderData = [
      {
        name: "Nam",
        value: totalStudents > 0 ? Math.round(maleCount / totalStudents * 100) : 0
      },
      {
        name: "Nữ",
        value: totalStudents > 0 ? Math.round(femaleCount / totalStudents * 100) : 0
      },
      {
        name: "Khác",
        value: totalStudents > 0 ? Math.round(otherCount / totalStudents * 100) : 0
      }
    ];

    res.status(200).json({
      occupancy: occupancyData,
      gender: genderData
    });
  } catch (error) {
    console.error('Error fetching occupancy stats:', error);
    res.status(500).json({ message: 'Error fetching occupancy statistics' });
  }
};