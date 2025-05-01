classDiagram
    class User {
        +id: int
        +email: string
        +password: string
        +userType: enum
        +refreshToken: string
        +resetPasswordToken: string
        +resetPasswordExpires: timestamp
        +status: enum
        +lastLogin: timestamp
        +createdAt: timestamp
        +updatedAt: timestamp
        +login()
        +logout()
        +resetPassword()
    }

    class Admin {
        +id: int
        +userId: int
        +staffCode: string
        +fullName: string
        +phone: string
        +role: enum
        +department: string
        +avatarPath: string
        +status: enum
        +createdAt: timestamp
        +updatedAt: timestamp
        +createStudent()
        +approveApplication()
        +manageRooms()
        +generateContract()
        +generateInvoice()
        +processMaintenance()
    }

    class Student {
        +id: int
        +userId: int
        +studentCode: string
        +fullName: string
        +gender: enum
        +birthDate: date
        +role: enum
        +phone: string
        +email: string
        +province: string
        +district: string
        +ward: string
        +address: string
        +faculty: string
        +major: string
        +className: string
        +avatarPath: string
        +status: enum
        +createdAt: timestamp
        +updatedAt: timestamp
        +applyForDorm()
        +payInvoice()
        +submitMaintenanceRequest()
    }

    class Building {
        +id: int
        +name: string
        +totalFloors: int
        +description: string
        +status: enum
        +createdAt: timestamp
        +addRoom()
        +updateStatus()
    }

    class Room {
        +id: int
        +buildingId: int
        +roomNumber: string
        +floorNumber: int
        +roomType: enum
        +capacity: int
        +currentOccupancy: int
        +pricePerMonth: decimal
        +description: string
        +roomImagePath: string
        +amenities: json
        +lastCleaned: timestamp
        +status: enum
        +roomArea: float
        +notes: text
        +createdAt: timestamp
        +updatedAt: timestamp
        +assignStudent()
        +updateOccupancy()
        +scheduleClean()
    }

    class RoomImage {
        +id: int
        +roomId: int
        +imagePath: string
        +isMain: boolean
        +createdAt: timestamp
    }

    class Contract {
        +id: int
        +contractNumber: string
        +studentId: int
        +roomId: int
        +startDate: date
        +endDate: date
        +depositAmount: decimal
        +monthlyFee: decimal
        +status: enum
        +createdBy: int
        +createdAt: timestamp
        +updatedAt: timestamp
        +generateInvoice()
        +terminate()
        +renew()
    }

    class Invoice {
        +id: int
        +invoiceNumber: string
        +contractId: int
        +studentId: int
        +roomId: int
        +invoiceMonth: date
        +dueDate: date
        +roomFee: decimal
        +electricFee: decimal
        +waterFee: decimal
        +serviceFee: decimal
        +totalAmount: decimal
        +paymentStatus: enum
        +paymentDate: timestamp
        +paymentMethod: string
        +createdAt: timestamp
        +markAsPaid()
        +sendReminder()
    }

    class MaintenanceRequest {
        +id: int
        +requestNumber: string
        +studentId: int
        +roomId: int
        +requestType: string
        +description: text
        +imagePaths: text
        +priority: enum
        +status: enum
        +assignedTo: int
        +resolvedAt: timestamp
        +resolutionNote: text
        +createdAt: timestamp
        +assignTechnician()
        +updateStatus()
        +resolveRequest()
    }

    class Notification {
        +id: int
        +title: string
        +content: text
        +type: string
        +senderId: int
        +recipientType: enum
        +recipientId: int
        +isRead: boolean
        +createdAt: timestamp
        +markAsRead()
        +send()
    }

    class ActivityLog {
        +id: int
        +userId: int
        +action: string
        +entityType: string
        +entityId: int
        +description: text
        +ipAddress: string
        +userAgent: text
        +createdAt: timestamp
        +logActivity()
    }

    User <|-- Admin : is a
    User <|-- Student : is a
    Building "1" *-- "many" Room : contains
    Room "1" *-- "many" RoomImage : has
    Student "1" -- "many" Contract : has
    Room "1" -- "many" Contract : associated with
    Contract "1" -- "many" Invoice : generates
    Student "1" -- "many" MaintenanceRequest : submits
    Room "1" -- "many" MaintenanceRequest : related to
    Admin "1" -- "many" MaintenanceRequest : handles
    User "1" -- "many" Notification : receives
    User "1" -- "many" ActivityLog : performs