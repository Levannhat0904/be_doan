# be_do_an
1. Bảng USERS (Người dùng)
    id: Khóa chính, tự động tăng
    email: Email đăng nhập, phải duy nhất
    password: Mật khẩu đã được mã hóa
    user_type: Loại người dùng ('admin' hoặc 'student')
    refresh_token: Token để làm mới JWT
    reset_password_token: Token để đặt lại mật khẩu
    reset_password_expires: Thời gian hết hạn của token đặt lại mật khẩu
    status: Trạng thái tài khoản ('active', 'inactive', 'blocked')
    last_login: Thời gian đăng nhập cuối
    created_at: Thời gian tạo tài khoản
    updated_at: Thời gian cập nhật cuối
2. Bảng ADMINS (Quản trị viên)
    id: Khóa chính
    user_id: Liên kết với bảng users
    staff_code: Mã nhân viên
    full_name: Họ tên đầy đủ
    phone: Số điện thoại
    role: Vai trò ('super_admin', 'admin', 'staff')
    department: Phòng ban
    avatar_path: Đường dẫn ảnh đại diện
    created_at, updated_at: Thời gian tạo/cập nhật
3. Bảng STUDENTS (Sinh viên)
    id: Khóa chính
    user_id: Liên kết với bảng users
    student_code: Mã sinh viên
    full_name: Họ tên đầy đủ
    gender: Giới tính
    birth_date: Ngày sinh
    phone: Số điện thoại
    address: Địa chỉ đầy đủ
    province, district, ward: Tỉnh/Thành phố, Quận/Huyện, Phường/Xã
    department: Khoa
    major: Ngành học
    class_name: Lớp
    school_year: Năm học
    avatar_path: Đường dẫn ảnh đại diện
    citizen_id: Số CCCD/CMND
    emergency_contact_name: Tên người liên hệ khẩn cấp
    emergency_contact_phone: SĐT liên hệ khẩn cấp
    emergency_contact_relationship: Mối quan hệ với người liên hệ
    status: Trạng thái ('active', 'graduated', 'suspended')
4. DORMITORY MANAGEMENT (Quản lý KTX)
    Bảng BUILDINGS (Tòa nhà):
      id: Khóa chính
      name: Tên tòa nhà
      total_floors: Tổng số tầng
      description: Mô tả
      status: Trạng thái ('active', 'inactive', 'maintenance')
      Bảng ROOMS (Phòng):
      id: Khóa chính
      building_id: Liên kết với tòa nhà
      room_number: Số phòng
      floor_number: Số tầng
      room_type: Loại phòng
      capacity: Sức chứa tối đa
      current_occupancy: Số người hiện tại
      price_per_month: Giá thuê/tháng
      room_image_path: Đường dẫn ảnh phòng
      status: Trạng thái ('available', 'full', 'maintenance')
    Bảng BEDS (Giường):
      id: Khóa chính
      room_id: Liên kết với phòng
      bed_number: Số giường
      description: Mô tả
      bed_image_path: Đường dẫn ảnh giường
      status: Trạng thái ('available', 'occupied', 'maintenance')
5. CONTRACTS & BILLING (Hợp đồng & Hóa đơn)
    Bảng CONTRACTS (Hợp đồng):
      contract_number: Số hợp đồng
      student_id, room_id, bed_id: Liên kết với sinh viên, phòng, giường
      start_date, end_date: Ngày bắt đầu/kết thúc
      deposit_amount: Tiền đặt cọc
      monthly_fee: Phí hàng tháng
      status: Trạng thái hợp đồng
      created_by: Admin tạo hợp đồng
      Bảng INVOICES (Hóa đơn):
      invoice_number: Số hóa đơn
      contract_id: Liên kết với hợp đồng
      invoice_month: Tháng xuất hóa đơn
      due_date: Hạn thanh toán
      room_fee: Tiền phòng
      electric_fee, water_fee, service_fee: Phí điện/nước/dịch vụ
      total_amount: Tổng tiền
      payment_status: Trạng thái thanh toán
      payment_date: Ngày thanh toán
      payment_method: Phương thức thanh toán
6. Bảng MAINTENANCE_REQUESTS (Yêu cầu bảo trì)
    request_number: Số yêu cầu
    student_id, room_id: Người yêu cầu và phòng
    request_type: Loại yêu cầu
    description: Mô tả vấn đề
    image_paths: Mảng đường dẫn ảnh
    priority: Mức độ ưu tiên
    status: Trạng thái xử lý
    assigned_to: Admin được phân công
    resolved_at: Thời gian hoàn thành
    resolution_note: Ghi chú giải quyết
7. NOTIFICATIONS & LOGS (Thông báo & Nhật ký)
    Bảng NOTIFICATIONS:
    title, content: Tiêu đề và nội dung
    type: Loại thông báo
    sender_id: Người gửi
    recipient_type, recipient_id: Người nhận
    is_read: Đã đọc chưa
    Bảng ACTIVITY_LOGS:
    user_id: Người thực hiện
    action: Hành động
    entity_type, entity_id: Đối tượng tác động
    description: Mô tả
    ip_address: Địa chỉ IP
    user_agent: Thông tin trình duyệt

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
