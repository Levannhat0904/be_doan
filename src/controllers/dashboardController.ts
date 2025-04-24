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
        ROUND(AVG(CAST(currentOccupancy AS FLOAT) / capacity * 100)) as occupancyRate
      FROM rooms`
    );

    // Get pending maintenance requests
    const [maintenanceResult] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as pendingRequests
       FROM maintenance_requests
       WHERE status = 'pending'`
    );

    // Get monthly revenue from all invoices, not limited to current month/year
    const [revenueResult] = await pool.query<RowDataPacket[]>(
      `SELECT SUM(totalAmount) as monthlyRevenue
       FROM invoices`
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

    // Get revenue by month for the specified year, also include next year data
    const [revenueData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        YEAR(invoiceMonth) as year,
        MONTH(invoiceMonth) as month,
        SUM(totalAmount) as revenue
       FROM invoices
       GROUP BY YEAR(invoiceMonth), MONTH(invoiceMonth)
       ORDER BY YEAR(invoiceMonth), MONTH(invoiceMonth)`
    );

    // Get student count by month (based on contracts that were active in each month)
    const [studentData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        MONTH(d) as month,
        COUNT(DISTINCT c.studentId) as students
       FROM (
         SELECT MAKEDATE(?, m) as d
         FROM (
           SELECT 1 as m UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
           UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
           UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
         ) months
       ) dates
       LEFT JOIN contracts c ON 
         ? BETWEEN YEAR(c.startDate) AND YEAR(c.endDate)
         AND MONTH(dates.d) BETWEEN MONTH(c.startDate) AND MONTH(c.endDate)
       GROUP BY MONTH(dates.d)
       ORDER BY month`,
      [year, year]
    );

    // Combine the data for the response
    const monthlyData = [];
    for (let i = 1; i <= 12; i++) {
      // Find all entries for this month from any year
      const monthEntries = revenueData.filter(
        item => parseInt(item.month) === i
      );

      // Sort by year descending to get the most recent data first
      monthEntries.sort((a, b) => parseInt(b.year) - parseInt(a.year));

      // Use the most recent data if available
      const revenueValue = monthEntries.length > 0 ? Number(monthEntries[0].revenue) : 0;

      const studentItem = studentData.find(item => parseInt(item.month) === i);

      monthlyData.push({
        month: i.toString(),
        revenue: revenueValue,
        students: studentItem ? parseInt(studentItem.students) : 0
      });
    }

    console.log('Revenue data from database:', revenueData);
    console.log('Monthly data being returned:', monthlyData);

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
       GROUP BY YEAR(invoiceMonth)
       ORDER BY year`
    );

    // Get yearly student count data
    const [studentData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        year,
        COUNT(DISTINCT studentId) as students
       FROM (
         SELECT 
           c.studentId,
           YEAR(dates.d) as year
         FROM (
           SELECT MAKEDATE(y, 1) as d
           FROM (
             SELECT ? as y UNION SELECT ? UNION SELECT ? UNION SELECT ? UNION SELECT ?
           ) years
         ) dates
         JOIN contracts c ON 
           YEAR(dates.d) BETWEEN YEAR(c.startDate) AND YEAR(c.endDate)
       ) yearly_students
       GROUP BY year
       ORDER BY year`,
      [startYear, startYear + 1, startYear + 2, startYear + 3, currentYear]
    );

    // Combine the data for the response
    const yearlyData = [];
    for (let year = startYear; year <= currentYear; year++) {
      const revenueItem = revenueData.find(item => parseInt(item.year) === year);
      const studentItem = studentData.find(item => item.year === year);

      yearlyData.push({
        year: year.toString(),
        revenue: revenueItem ? revenueItem.revenue : 0,
        students: studentItem ? studentItem.students : 0
      });
    }

    // Add future years that have revenue data
    const futureYears = revenueData.filter(item => parseInt(item.year) > currentYear);
    for (const item of futureYears) {
      yearlyData.push({
        year: item.year.toString(),
        revenue: item.revenue,
        students: 0
      });
    }

    console.log('Yearly data being returned:', yearlyData);

    res.status(200).json(yearlyData);
  } catch (error) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ message: 'Error fetching yearly statistics' });
  }
};

// Get occupancy data for the pie charts
export const getOccupancyStats = async (req: Request, res: Response) => {
  try {
    // Get monthly occupancy stats based on room occupancy
    const [roomOccupancy] = await pool.query<RowDataPacket[]>(
      `SELECT 
         SUM(currentOccupancy) as occupied,
         SUM(capacity - currentOccupancy) as available
       FROM rooms
       WHERE status != 'maintenance'`
    );

    // Calculate percentages for the pie charts
    const totalCapacity = roomOccupancy[0].occupied + roomOccupancy[0].available;

    const monthlyOccupancyData = [
      {
        name: "Đã sử dụng",
        value: totalCapacity > 0 ? Math.round(roomOccupancy[0].occupied / totalCapacity * 100) : 0
      },
      {
        name: "Còn trống",
        value: totalCapacity > 0 ? Math.round(roomOccupancy[0].available / totalCapacity * 100) : 0
      }
    ];

    res.status(200).json({
      monthly: monthlyOccupancyData,
      yearly: monthlyOccupancyData
    });
  } catch (error) {
    console.error('Error fetching occupancy stats:', error);
    res.status(500).json({ message: 'Error fetching occupancy statistics' });
  }
};