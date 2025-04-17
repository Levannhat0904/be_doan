# be_do_an
1. Bảng USERS (Người dùng)
    id: Khóa chính, tự động tăng
    email: Email đăng nhập, phải duy nhất
    password: Mật khẩu đã được mã hóa
    userType: Loại người dùng ('admin' hoặc 'student')
    refreshToken: Token để làm mới JWT
    resetPasswordToken: Token để đặt lại mật khẩu
    resetPasswordExpires: Thời gian hết hạn của token đặt lại mật khẩu
    status: Trạng thái tài khoản ('active', 'inactive', 'blocked')
    lastLogin: Thời gian đăng nhập cuối
    createdAt: Thời gian tạo tài khoản
    updatedAt: Thời gian cập nhật cuối
2. Bảng ADMINS (Quản trị viên)
    id: Khóa chính
    userId: Liên kết với bảng users
    staffCode: Mã nhân viên
    fullName: Họ tên đầy đủ
    phone: Số điện thoại
    role: Vai trò ('super_admin', 'admin', 'staff')
    department: Phòng ban
    avatarPath: Đường dẫn ảnh đại diện
    createdAt, updatedAt: Thời gian tạo/cập nhật
3. Bảng STUDENTS (Sinh viên)
    id: Khóa chính
    userId: Liên kết với bảng users
    studentCode: Mã sinh viên
    fullName: Họ tên đầy đủ
    gender: Giới tính
    birthDate: Ngày sinh
    phone: Số điện thoại
    address: Địa chỉ đầy đủ
    province, district, ward: Tỉnh/Thành phố, Quận/Huyện, Phường/Xã
    department: Khoa
    major: Ngành học
    className: Lớp
    school_year: Năm học
    avatarPath: Đường dẫn ảnh đại diện
    citizen_id: Số CCCD/CMND
    emergency_contact_name: Tên người liên hệ khẩn cấp
    emergency_contact_phone: SĐT liên hệ khẩn cấp
    emergency_contact_relationship: Mối quan hệ với người liên hệ
    status: Trạng thái ('active', 'graduated', 'suspended')
4. DORMITORY MANAGEMENT (Quản lý KTX)
    Bảng BUILDINGS (Tòa nhà):
      id: Khóa chính
      name: Tên tòa nhà
      totalFloors: Tổng số tầng
      description: Mô tả
      status: Trạng thái ('active', 'inactive', 'maintenance')
      Bảng ROOMS (Phòng):
      id: Khóa chính
      buildingId: Liên kết với tòa nhà
      roomNumber: Số phòng
      floorNumber: Số tầng
      roomType: Loại phòng
      capacity: Sức chứa tối đa
      currentOccupancy: Số người hiện tại
      pricePerMonth: Giá thuê/tháng
      roomImagePath: Đường dẫn ảnh phòng
      status: Trạng thái ('available', 'full', 'maintenance')
    Bảng BEDS (Giường):
      id: Khóa chính
      roomId: Liên kết với phòng
      bedNumber: Số giường
      description: Mô tả
      bedImagePath: Đường dẫn ảnh giường
      status: Trạng thái ('available', 'occupied', 'maintenance')
5. CONTRACTS & BILLING (Hợp đồng & Hóa đơn)
    Bảng CONTRACTS (Hợp đồng):
      contractNumber: Số hợp đồng
      studentId, roomId, bedId: Liên kết với sinh viên, phòng, giường
      startDate, endDate: Ngày bắt đầu/kết thúc
      depositAmount: Tiền đặt cọc
      monthlyFee: Phí hàng tháng
      status: Trạng thái hợp đồng
      createdBy: Admin tạo hợp đồng
      Bảng INVOICES (Hóa đơn):
      invoiceNumber: Số hóa đơn
      contractId: Liên kết với hợp đồng
      invoiceMonth: Tháng xuất hóa đơn
      dueDate: Hạn thanh toán
      roomFee: Tiền phòng
      electricFee, waterFee, serviceFee: Phí điện/nước/dịch vụ
      totalAmount: Tổng tiền
      paymentStatus: Trạng thái thanh toán
      paymentDate: Ngày thanh toán
      paymentMethod: Phương thức thanh toán
6. Bảng MAINTENANCE_REQUESTS (Yêu cầu bảo trì)
    requestNumber: Số yêu cầu
    studentId, roomId: Người yêu cầu và phòng
    requestType: Loại yêu cầu
    description: Mô tả vấn đề
    imagePaths: Mảng đường dẫn ảnh
    priority: Mức độ ưu tiên
    status: Trạng thái xử lý
    assignedTo: Admin được phân công
    resolvedAt: Thời gian hoàn thành
    resolutionNote: Ghi chú giải quyết
7. NOTIFICATIONS & LOGS (Thông báo & Nhật ký)
    Bảng NOTIFICATIONS:
    title, content: Tiêu đề và nội dung
    type: Loại thông báo
    senderId: Người gửi
    recipientType, recipientId: Người nhận
    isRead: Đã đọc chưa
    Bảng ACTIVITY_LOGS:
    userId: Người thực hiện
    action: Hành động
    entityType, entityId: Đối tượng tác động
    description: Mô tả
    ipAddress: Địa chỉ IP
    userAgent: Thông tin trình duyệt

        ### hệ thống có 11 bảng chính:
        users - Bảng tài khoản người dùng
        Lưu thông tin đăng nhập (email, password)
        Phân loại người dùng (admin/student)
        Quản lý trạng thái tài khoản
        admins - Bảng thông tin quản trị viên
        Thông tin cá nhân của admin
        Phân quyền (super_admin/admin/staff)
        Liên kết với bảng users
        students - Bảng thông tin sinh viên
        Thông tin cá nhân sinh viên
        Thông tin học tập
        Thông tin liên hệ khẩn cấp
        Liên kết với bảng users
        buildings - Bảng tòa nhà
        Thông tin các tòa nhà trong KTX
        Số tầng, trạng thái
        rooms - Bảng phòng
        Thông tin phòng (số phòng, tầng, loại phòng)
        Sức chứa và số người hiện tại
        Giá phòng
        Liên kết với tòa nhà
        beds - Bảng giường
        Thông tin giường trong phòng
        Trạng thái giường
        Liên kết với phòng
        contracts - Bảng hợp đồng
        Thông tin hợp đồng thuê phòng
        Thời gian thuê
        Tiền cọc và phí hàng tháng
        Liên kết với sinh viên, phòng, giường
        invoices - Bảng hóa đơn
        Hóa đơn hàng tháng
        Chi tiết các khoản phí (phòng, điện, nước)
        Trạng thái thanh toán
        Liên kết với hợp đồng
        maintenance_requests - Bảng yêu cầu bảo trì
        Thông tin sự cố/yêu cầu sửa chữa
        Mức độ ưu tiên và trạng thái
        Người được phân công xử lý
        Liên kết với sinh viên và phòng
        notifications - Bảng thông báo
        Nội dung thông báo
        Người gửi và người nhận
        Trạng thái đã đọc
        activity_logs - Bảng nhật ký hoạt động
        Ghi lại các hoạt động trong hệ thống
        Thông tin người thực hiện
        IP và thiết bị truy cập
        Mối quan hệ giữa các bảng:
        users là bảng trung tâm, liên kết với admins và students
        buildings -> rooms -> beds (quan hệ phân cấp)
        contracts liên kết nhiều bảng (students, rooms, beds, admins)
        invoices liên kết với contracts và thông tin liên quan
        Các bảng còn lại liên kết theo chức năng tương ứng
GET /api/student/:id - Lấy thông tin chi tiết sinh viên
POST /api/room/assign - Phân phòng cho sinh viên
POST /api/room/cancel - Hủy phòng của sinh viên
API lấy thông tin sinh viên
API phân phòng
API hủy phòng
API lấy thông tin vi phạm
API lấy thông tin hóa đơn