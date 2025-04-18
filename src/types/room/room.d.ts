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

export interface RoomDetail {
  room: Room;
  residents: {
    id: number;
    studentCode: string;
    fullName: string;
    gender: string;
    phone: string;
    email: string;
    joinDate: Date;
    endDate: Date;
    bedNumber: string;
    status: string;
    faculty: string;
    major: string;
    avatarPath?: string;
    paymentStatus: string;
  }[];
  maintenanceHistory: {
    id: number;
    date: Date;
    type: string;
    description: string;
    cost: number;
    staff: string;
    status: string;
  }[];
  pendingRequests: {
    id: number;
    date: Date;
    type: string;
    description: string;
    requestedBy: string;
    status: string;
    priority: string;
  }[];
  utilities: {
    id: number;
    month: string;
    electricity: number;
    water: number;
    electricityCost: number;
    waterCost: number;
    otherFees: number;
    totalCost: number;
    dueDate: Date;
    status: string;
    paidDate?: Date;
  }[];
}