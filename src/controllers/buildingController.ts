// be/src/controllers/buildingController.ts
import { Request, Response, RequestHandler } from "express";
import pool from "../config/database";
import { RowDataPacket, OkPacket } from "mysql2";
import activityLogService from "../services/activityLogService";

interface Building {
  id: number;
  name: string;
  totalFloors: number;
  description?: string;
  status: "active" | "inactive" | "maintenance";
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
      message: "Buildings retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting buildings:", error);
    res.status(500).json({ message: "Internal server error" });
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
      res.status(404).json({ message: "Building not found" });
      return;
    }

    const [rooms] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM rooms WHERE buildingId = ?`,
      [id]
    );

    res.json({
      data: {
        ...building[0],
        rooms,
      },
      message: "Building retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting building:", error);
    res.status(500).json({ message: "Internal server error" });
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
      res.status(400).json({ message: "Name and totalFloors are required" });
      return;
    }

    const [result] = await pool.query<OkPacket>(
      `INSERT INTO buildings (name, totalFloors, description, status) 
       VALUES (?, ?, ?, ?)`,
      [name, totalFloors, description, status || "active"]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        "create",
        "building",
        result.insertId,
        `Created building: ${name}`,
        req,
        undefined,
        undefined,
        undefined,
        undefined
      );
    }

    res.status(201).json({
      data: { id: result.insertId },
      message: "Building created successfully",
    });
  } catch (error) {
    console.error("Error creating building:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update building
export const updateBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, totalFloors, description, status } = req.body;

    const [building] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM buildings WHERE id = ?",
      [id]
    );

    if (!building.length) {
      res.status(404).json({ message: "Building not found" });
      return;
    }

    await pool.query(
      `UPDATE buildings 
       SET name = ?, totalFloors = ?, description = ?, status = ?
       WHERE id = ?`,
      [name, totalFloors, description, status, id]
    );

    // Log activity
    if (req.user?.id) {
      await activityLogService.logActivity(
        req.user.id,
        "update",
        "building",
        Number(id),
        `Updated building: ${building[0].name} -> ${name}`,
        req,
        Number(id),
        undefined,
        undefined,
        undefined
      );
    }

    res.json({
      message: "Building updated successfully",
    });
  } catch (error) {
    console.error("Error updating building:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete building
export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [rooms] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) as count FROM rooms WHERE buildingId = ?",
      [id]
    );

    if (rooms[0].count > 0) {
      res.status(400).json({
        message: "Cannot delete building with existing rooms",
      });
      return;
    }

    // Get building name for logging
    const [building] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM buildings WHERE id = ?",
      [id]
    );

    await pool.query("DELETE FROM buildings WHERE id = ?", [id]);

    // Log activity
    if (req.user?.id && building.length > 0) {
      await activityLogService.logActivity(
        req.user.id,
        "delete",
        "building",
        Number(id),
        `Deleted building: ${building[0].name}`,
        req,
        Number(id),
        undefined,
        undefined,
        undefined
      );
    }

    res.json({
      message: "Building deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting building:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get buildings with available rooms
export const getAvailableBuildings = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const query = `
      SELECT 
        b.id,
        b.name as label,
        b.id as value,
        COUNT(DISTINCT r.id) as totalRooms,
        COUNT(DISTINCT CASE WHEN r.status = 'available' THEN r.id END) as availableRooms
      FROM buildings b
      LEFT JOIN rooms r ON b.id = r.buildingId AND r.status != 'maintenance'
      WHERE b.status = 'active'
      GROUP BY b.id
      HAVING availableRooms > 0
    `;

    const [buildings] = await pool.query<RowDataPacket[]>(query);

    res.json({
      success: true,
      data: buildings,
      message: "Available buildings retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting available buildings:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get available rooms in a building
export const getAvailableRooms = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { buildingId } = req.params;
    const { gender } = req.query;

    if (!buildingId) {
      res.status(400).json({
        success: false,
        message: "Building ID is required",
      });
      return;
    }

    let genderFilter = "";
    if (gender === "male" || gender === "female") {
      genderFilter = `AND r.roomType = '${gender}'`;
    }

    const query = `
      SELECT 
        r.id as value,
        r.roomNumber as label,
        r.floorNumber,
        r.roomType,
        r.capacity,
        r.currentOccupancy,
        r.pricePerMonth,
        (r.capacity - r.currentOccupancy) as availableBeds
      FROM rooms r
      WHERE r.buildingId = ? 
        AND r.status = 'available'
        ${genderFilter}
      HAVING availableBeds > 0
      ORDER BY r.floorNumber, r.roomNumber
    `;

    const [rooms] = await pool.query<RowDataPacket[]>(query, [buildingId]);

    res.json({
      success: true,
      data: rooms,
      message: "Available rooms retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting available rooms:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
