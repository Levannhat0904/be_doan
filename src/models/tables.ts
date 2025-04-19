export const createTablesSQL = `
    -- 1. AUTHENTICATION & USERS
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255),
        userType ENUM('admin', 'student') NOT NULL,
        refreshToken TEXT,
        resetPasswordToken TEXT,
        resetPasswordExpires TIMESTAMP NULL,
        status ENUM('active', 'inactive','pending', 'blocked') DEFAULT 'active',
        lastLogin TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 2. ADMIN PROFILE
    CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT UNIQUE,
        staffCode VARCHAR(20) UNIQUE NOT NULL,
        fullName VARCHAR(100) NOT NULL,
        phone VARCHAR(15) UNIQUE,
        role ENUM('super_admin', 'admin', 'staff') NOT NULL,
        department VARCHAR(100),
        avatarPath TEXT,
        status ENUM('active', 'inactive','pending', 'blocked') DEFAULT 'active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 3. STUDENT PROFILE
    CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT UNIQUE,
        studentCode VARCHAR(20) UNIQUE NOT NULL,
        fullName VARCHAR(100) NOT NULL,
        gender ENUM('male', 'female', 'other') NOT NULL,
        birthDate DATE NOT NULL,
        role ENUM('student') NOT NULL DEFAULT 'student',
        
        -- Thông tin liên lạc
        phone VARCHAR(15) UNIQUE NOT NULL,
        email VARCHAR(100) NOT NULL,
        
        -- Thông tin địa chỉ
        province VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        ward VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        
        -- Thông tin học vụ
        faculty VARCHAR(100) NOT NULL,
        major VARCHAR(100) NOT NULL,
        className VARCHAR(50) NOT NULL,
        
        -- Ảnh chân dung
        avatarPath TEXT,
        status ENUM('pending', 'active', 'inactive', 'blocked') DEFAULT 'pending',
        
        -- Metadata
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 4. DORMITORY MANAGEMENT
    CREATE TABLE IF NOT EXISTS buildings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        totalFloors INT NOT NULL,
        description TEXT,
        status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        buildingId INT,
        roomNumber VARCHAR(20) NOT NULL,
        floorNumber INT NOT NULL,
        roomType ENUM('male', 'female') NOT NULL, 
        capacity INT NOT NULL,
        currentOccupancy INT DEFAULT 0,
        pricePerMonth DECIMAL(10,2) NOT NULL,
        description TEXT,
        roomImagePath TEXT,
        amenities JSON, 
        lastCleaned TIMESTAMP NULL, 
        status ENUM('available', 'full', 'maintenance') DEFAULT 'available',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_room (buildingId, roomNumber),
        FOREIGN KEY (buildingId) REFERENCES buildings(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
     -- Thêm cột roomArea (diện tích phòng) vào bảng rooms
ALTER TABLE rooms ADD COLUMN roomArea FLOAT;

-- Thêm cột notes (ghi chú) vào bảng rooms
ALTER TABLE rooms ADD COLUMN notes TEXT;
    -- Thêm vào file tables.ts
CREATE TABLE IF NOT EXISTS room_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roomId INT NOT NULL,
    imagePath VARCHAR(255) NOT NULL,
    isMain BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    CREATE TABLE IF NOT EXISTS beds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        roomId INT,
        bedNumber VARCHAR(10) NOT NULL,
        description TEXT,
        bedImagePath TEXT,
        status ENUM('available', 'occupied', 'maintenance') DEFAULT 'available',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_bed (roomId, bedNumber),
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 5. CONTRACTS & BILLING
    CREATE TABLE IF NOT EXISTS contracts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contractNumber VARCHAR(50) UNIQUE NOT NULL,
        studentId INT,
        roomId INT,
        bedId INT,
        startDate DATE NOT NULL,
        endDate DATE NOT NULL,
        depositAmount DECIMAL(10,2) NOT NULL,
        monthlyFee DECIMAL(10,2) NOT NULL,
        status ENUM('active', 'expired', 'terminated') DEFAULT 'active',
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (bedId) REFERENCES beds(id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES admins(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoiceNumber VARCHAR(50) UNIQUE NOT NULL,
        contractId INT,
        studentId INT,
        roomId INT,
        invoiceMonth DATE NOT NULL,
        dueDate DATE NOT NULL,
        roomFee DECIMAL(10,2) NOT NULL,
        electricFee DECIMAL(10,2) DEFAULT 0,
        waterFee DECIMAL(10,2) DEFAULT 0,
        serviceFee DECIMAL(10,2) DEFAULT 0,
        totalAmount DECIMAL(10,2) NOT NULL,
        paymentStatus ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
        paymentDate TIMESTAMP NULL,
        paymentMethod VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contractId) REFERENCES contracts(id) ON DELETE CASCADE,
        FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 6. MAINTENANCE REQUESTS
    CREATE TABLE IF NOT EXISTS maintenance_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requestNumber VARCHAR(50) UNIQUE NOT NULL,
        studentId INT,
        roomId INT,
        requestType VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        imagePaths TEXT,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        status ENUM('pending', 'processing', 'completed', 'rejected') DEFAULT 'pending',
        assignedTo INT,
        resolvedAt TIMESTAMP NULL,
        resolutionNote TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (assignedTo) REFERENCES admins(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 7. NOTIFICATIONS & LOGS
    CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50),
        senderId INT,
        recipientType ENUM('admin', 'student', 'all') NOT NULL,
        recipientId INT,
        isRead BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT,
        action VARCHAR(100) NOT NULL,
        entityType VARCHAR(50),
        entityId INT,
        description TEXT,
        ipAddress VARCHAR(45),
        userAgent TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Create indexes
    CREATE INDEX idxUsersEmail ON users(email);
    CREATE INDEX idxStudentsStudentCode ON students(studentCode);
    CREATE INDEX idxAdminsStaffCode ON admins(staffCode);
    CREATE INDEX idxContractsStudentId ON contracts(studentId);
    CREATE INDEX idxInvoicesStudentId ON invoices(studentId);
    CREATE INDEX idxMaintenanceRequestsStudentId ON maintenance_requests(studentId);
    CREATE INDEX idxNotificationsRecipientId ON notifications(recipientId);
    CREATE INDEX idxActivityLogsUserId ON activity_logs(userId);
`;