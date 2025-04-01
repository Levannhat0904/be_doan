import { AdminService } from '../services/adminService';
import { ADMIN_ROLES } from '../config/constants';

async function createFirstAdmin() {
  try {
    const adminData = {
      email: 'admin@utt.edu.vn',
      password: 'Admin@123',
      staffCode: 'ADMIN001',
      fullName: 'Super Admin',
      role: ADMIN_ROLES.SUPER_ADMIN
    };

    const result = await AdminService.createAdmin(adminData);
    console.log('Tạo tài khoản admin thành công:', result);
  } catch (error) {
    console.error('Lỗi khi tạo tài khoản admin:', error);
  }
}

createFirstAdmin(); 