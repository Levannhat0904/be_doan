export const createTablesSQL = `
    -- 1. AUTHENTICATION & USERS
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_type ENUM('admin', 'student') NOT NULL,
        refresh_token TEXT,
        reset_password_token TEXT,
        reset_password_expires TIMESTAMP NULL,
        status ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 2. ADMIN PROFILE
    CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE,
        staff_code VARCHAR(20) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(15) UNIQUE,
        role ENUM('super_admin', 'admin', 'staff') NOT NULL,
        department VARCHAR(100),
        avatar_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 3. STUDENT PROFILE
    CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE,
        student_code VARCHAR(20) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        gender ENUM('male', 'female', 'other') NOT NULL,
        birth_date DATE,
        phone VARCHAR(15) UNIQUE,
        address TEXT,
        province VARCHAR(100),
        district VARCHAR(100),
        ward VARCHAR(100),
        department VARCHAR(100),
        major VARCHAR(100),
        class_name VARCHAR(50),
        school_year INT,
        avatar_path TEXT,
        citizen_id VARCHAR(20) UNIQUE,
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(15),
        emergency_contact_relationship VARCHAR(50),
        status ENUM('active', 'graduated', 'suspended') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ALTER TABLE students
        ADD COLUMN personal_email VARCHAR(100),
        ADD COLUMN school_email VARCHAR(100),
        ADD COLUMN ethnicity VARCHAR(50),
        ADD COLUMN religion VARCHAR(50),
        ADD COLUMN father_name VARCHAR(100),
        ADD COLUMN father_phone VARCHAR(15),
        ADD COLUMN father_address_same_as_student BOOLEAN DEFAULT TRUE,
        ADD COLUMN father_address TEXT,
        ADD COLUMN mother_name VARCHAR(100),
        ADD COLUMN mother_phone VARCHAR(15),
        ADD COLUMN mother_address_same_as_student BOOLEAN DEFAULT TRUE,
        ADD COLUMN mother_address TEXT;
    -- 4. DORMITORY MANAGEMENT
    CREATE TABLE IF NOT EXISTS buildings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        total_floors INT NOT NULL,
        description TEXT,
        status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        building_id INT,
        room_number VARCHAR(20) NOT NULL,
        floor_number INT NOT NULL,
        room_type VARCHAR(20) NOT NULL,
        capacity INT NOT NULL,
        current_occupancy INT DEFAULT 0,
        price_per_month DECIMAL(10,2) NOT NULL,
        description TEXT,
        room_image_path TEXT,
        status ENUM('available', 'full', 'maintenance') DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_room (building_id, room_number),
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS beds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT,
        bed_number VARCHAR(10) NOT NULL,
        description TEXT,
        bed_image_path TEXT,
        status ENUM('available', 'occupied', 'maintenance') DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_bed (room_id, bed_number),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 5. CONTRACTS & BILLING
    CREATE TABLE IF NOT EXISTS contracts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_number VARCHAR(50) UNIQUE NOT NULL,
        student_id INT,
        room_id INT,
        bed_id INT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        deposit_amount DECIMAL(10,2) NOT NULL,
        monthly_fee DECIMAL(10,2) NOT NULL,
        status ENUM('active', 'expired', 'terminated') DEFAULT 'active',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES admins(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        contract_id INT,
        student_id INT,
        room_id INT,
        invoice_month DATE NOT NULL,
        due_date DATE NOT NULL,
        room_fee DECIMAL(10,2) NOT NULL,
        electric_fee DECIMAL(10,2) DEFAULT 0,
        water_fee DECIMAL(10,2) DEFAULT 0,
        service_fee DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
        payment_date TIMESTAMP NULL,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 6. MAINTENANCE REQUESTS
    CREATE TABLE IF NOT EXISTS maintenance_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(50) UNIQUE NOT NULL,
        student_id INT,
        room_id INT,
        request_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        image_paths TEXT,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        status ENUM('pending', 'processing', 'completed', 'rejected') DEFAULT 'pending',
        assigned_to INT,
        resolved_at TIMESTAMP NULL,
        resolution_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES admins(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 7. NOTIFICATIONS & LOGS
    CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50),
        sender_id INT,
        recipient_type ENUM('admin', 'student', 'all') NOT NULL,
        recipient_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INT,
        description TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Create indexes
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_students_student_code ON students(student_code);
    CREATE INDEX idx_admins_staff_code ON admins(staff_code);
    CREATE INDEX idx_contracts_student_id ON contracts(student_id);
    CREATE INDEX idx_invoices_student_id ON invoices(student_id);
    CREATE INDEX idx_maintenance_requests_student_id ON maintenance_requests(student_id);
    CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
    CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
`;