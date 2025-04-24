import pool from '../config/database';
import logger from '../utils/logger';
import { ResultSetHeader } from 'mysql2';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Building names for variety
const buildings = [
  { id: 1, name: 'Tòa nhà A', totalFloors: 10 },
  { id: 2, name: 'Tòa nhà B', totalFloors: 8 },
  { id: 3, name: 'Tòa nhà C', totalFloors: 12 }
];

// Amenities options
const amenitiesOptions = [
  ['Điều hòa', 'Tủ lạnh', 'Wifi', 'Máy giặt chung'],
  ['Điều hòa', 'Bàn học', 'Tủ quần áo', 'Wifi'],
  ['Bàn học', 'Tủ quần áo', 'Chăn ga gối'],
  ['Điều hòa', 'Bàn học', 'Wifi'],
  ['Tủ lạnh', 'Tivi', 'Bàn học', 'Tủ quần áo', 'Wifi']
];

// Room statuses
const roomStatuses = ['available', 'available', 'available', 'maintenance'];

// Room types
const roomTypes = ['male', 'female'];

// Price tiers
const priceTiers = [500000, 600000, 700000, 800000, 900000];

/**
 * Create sample buildings
 */
async function seedBuildings() {
  try {
    logger.info('Seeding buildings...');

    for (const building of buildings) {
      await pool.query(
        'INSERT INTO buildings (id, name, totalFloors, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=name',
        [building.id, building.name, building.totalFloors, 'active']
      );
    }

    logger.info('Buildings seeded successfully');
  } catch (error) {
    logger.error('Error seeding buildings:', error);
    throw error;
  }
}

/**
 * Create sample rooms
 */
async function seedRooms() {
  try {
    logger.info('Seeding rooms...');

    // Clear existing test data
    // Uncomment if you want to clear data before seeding
    // await pool.query('DELETE FROM rooms WHERE id > 0');

    let roomCount = 0;

    for (const building of buildings) {
      // Create rooms for each floor
      for (let floor = 1; floor <= building.totalFloors; floor++) {
        // Create 4 rooms per floor
        for (let room = 1; room <= 4; room++) {
          // Generate room data
          const roomNumber = `${building.name.slice(-1)}${floor.toString().padStart(2, '0')}${room.toString().padStart(2, '0')}`;
          const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
          const capacity = Math.floor(Math.random() * 3) + 2; // 2-4 capacity
          const pricePerMonth = priceTiers[Math.floor(Math.random() * priceTiers.length)];
          const status = roomStatuses[Math.floor(Math.random() * roomStatuses.length)];
          const amenities = JSON.stringify(amenitiesOptions[Math.floor(Math.random() * amenitiesOptions.length)]);

          // Random occupancy for sample data (30% chance that each capacity slot is filled)
          let currentOccupancy = 0;
          if (status === 'available') {
            for (let i = 0; i < capacity; i++) {
              if (Math.random() < 0.3) currentOccupancy++;
            }
          }

          // If occupancy equals capacity, update status to full
          const finalStatus = status === 'available' && currentOccupancy >= capacity ? 'full' : status;

          // Insert room
          const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO rooms 
            (buildingId, roomNumber, floorNumber, roomType, capacity, currentOccupancy, pricePerMonth, amenities, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE roomNumber=roomNumber`,
            [building.id, roomNumber, floor, roomType, capacity, currentOccupancy, pricePerMonth, amenities, finalStatus]
          );

          if (result.insertId) {
            roomCount++;
          }
        }
      }
    }

    logger.info(`${roomCount} rooms seeded successfully`);
  } catch (error) {
    logger.error('Error seeding rooms:', error);
    throw error;
  }
}

/**
 * Add sample images to existing rooms
 */
async function seedRoomImages() {
  try {
    logger.info('Seeding room images...');

    // Get all room IDs
    const [rooms] = await pool.query<any[]>('SELECT id FROM rooms');

    for (const room of rooms) {
      // Create sample image paths
      const imagePaths = [
        `/uploads/rooms/room_${room.id}_1.jpg`,
        `/uploads/rooms/room_${room.id}_2.jpg`,
        `/uploads/rooms/room_${room.id}_3.jpg`
      ];

      // Update room with image path
      await pool.query(
        'UPDATE rooms SET roomImagePath = ? WHERE id = ?',
        [JSON.stringify(imagePaths), room.id]
      );

      // Add to room_images table
      for (let i = 0; i < imagePaths.length; i++) {
        await pool.query(
          'INSERT INTO room_images (roomId, imagePath, isMain) VALUES (?, ?, ?)',
          [room.id, imagePaths[i], i === 0]
        );
      }
    }

    logger.info('Room images seeded successfully');
  } catch (error) {
    logger.error('Error seeding room images:', error);
    throw error;
  }
}

/**
 * Main seed function
 */
async function seedData() {
  try {
    logger.info('Starting database seed...');

    // Seed data in order
    await seedBuildings();
    await seedRooms();
    await seedRoomImages();

    logger.info('Database seed completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database seed failed:', error);
    process.exit(1);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  seedData();
}

export default seedData; 