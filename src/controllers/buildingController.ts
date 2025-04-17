// be/src/controllers/buildingController.ts
import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, OkPacket } from 'mysql2';

interface Building {
  id: number;
  name: string;
  totalFloors: number;
  description?: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: Date;
}

// Get all buildings
export const getBuildings = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        b.*,
        COUNT(DISTINCT r.id) as totalRooms,
        COUNT(DISTINCT CASE WHEN r.status = 'available' THEN r.id END) as availableRooms
      FROM buildings b
      LEFT JOIN rooms r ON b.id = r.buildingId
      GROUP BY b.id
    `;

    const [buildings] = await pool.query<RowDataPacket[]>(query);

    res.json({
      data: buildings,
      message: 'Buildings retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting buildings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get building by id
export const getBuildingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [building] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM buildings WHERE id = ?`,
      [id]
    );

    if (!building.length) {
      res.status(404).json({ message: 'Building not found' });
      return;
    }

    const [rooms] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM rooms WHERE buildingId = ?`,
      [id]
    );

    res.json({
      data: {
        ...building[0],
        rooms
      },
      message: 'Building retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create new building
export const createBuilding = async (req: Request, res: Response) => {
  try {
    // const { name, totalFloors, description, status } = req.body;
    const name = req.body.name;
    const totalFloors = req.body.totalFloors;
    const description = req.body.description;
    const status = req.body.status;
    if (!name || !totalFloors) {
      res.status(400).json({ message: 'Name and totalFloors are required' });
      return;
    }

    const [result] = await pool.query<OkPacket>(
      `INSERT INTO buildings (name, totalFloors, description, status) 
       VALUES (?, ?, ?, ?)`,
      [name, totalFloors, description, status || 'active']
    );

    res.status(201).json({
      data: { id: result.insertId },
      message: 'Building created successfully'
    });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update building
export const updateBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, totalFloors, description, status } = req.body;

    const [building] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM buildings WHERE id = ?',
      [id]
    );

    if (!building.length) {
      res.status(404).json({ message: 'Building not found' });
      return;
    }

    await pool.query(
      `UPDATE buildings 
       SET name = ?, totalFloors = ?, description = ?, status = ?
       WHERE id = ?`,
      [name, totalFloors, description, status, id]
    );

    res.json({
      message: 'Building updated successfully'
    });
  } catch (error) {
    console.error('Error updating building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete building
export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [rooms] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM rooms WHERE buildingId = ?',
      [id]
    );

    if (rooms[0].count > 0) {
      res.status(400).json({
        message: 'Cannot delete building with existing rooms'
      });
      return;
    }

    await pool.query('DELETE FROM buildings WHERE id = ?', [id]);

    res.json({
      message: 'Building deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};