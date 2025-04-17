export interface Room {
  id: number;
  buildingId: number;
  buildingName: string;
  roomNumber: string;
  floorNumber: number;
  roomType: 'male' | 'female';
  capacity: number;
  currentOccupancy: number;
  pricePerMonth: number;
  description?: string;
  roomImagePath?: string;
  amenities: string[];
  lastCleaned?: Date;
  status: 'active' | 'maintenance';
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomFilters {
  buildingName?: string;
  type?: 'male' | 'female';
  status?: 'active' | 'maintenance';
  searchText?: string;
  availability?: 'available' | 'full';
}

export interface RoomResponse {
  data: Room[];
  pagination: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    totalRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    occupancyRate: number;
  };
}