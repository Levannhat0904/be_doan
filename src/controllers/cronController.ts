import { updateContractStatus, updateInvoiceStatus, logAutomatedActivity } from '../services/cronService';
import { sendEmail } from '../services/sendMail';
import logger from '../utils/logger';
import pool from '../config/database';

/**
 * Controller xử lý cập nhật trạng thái hợp đồng
 */
export const runContractStatusUpdate = async () => {
  try {
    // Lấy danh sách hợp đồng được cập nhật để gửi mail
    const updatedContracts = await updateContractStatus();
    
    // Ghi log và gửi mail cho từng hợp đồng
    if (Array.isArray(updatedContracts)) {
      logger.info(`Số hợp đồng hết hạn cần xử lý: ${updatedContracts.length}`);
      
      if (updatedContracts.length > 0) {
        for (const contract of updatedContracts) {
          // Ghi log cho từng hợp đồng
          await logAutomatedActivity(
            'contract_status_update', 
            'contracts', 
            `Cập nhật tự động trạng thái hợp đồng ${contract.contractNumber} sang "expired" (hết hạn)`,
            contract.roomId,
            undefined,
            contract.contractId,
            contract.studentId
          );
          
          // Gửi mail thông báo cho sinh viên
          if (contract.email) {
            const to = {
              Email: contract.email,
              Name: contract.fullName
            };
            
            const subject = "Thông báo: Hợp đồng của bạn đã hết hạn";
            const text = `Hợp đồng của bạn tại phòng ${contract.roomNumber}, tòa nhà ${contract.buildingName} đã hết hạn`;
            const html = `
              <h3>Xin chào ${contract.fullName},</h3>
              <p>Chúng tôi xin thông báo rằng hợp đồng thuê phòng của bạn đã hết hạn.</p>
              <p><strong>Thông tin hợp đồng:</strong></p>
              <ul>
                <li>Mã hợp đồng: ${contract.contractNumber}</li>
                <li>Phòng: ${contract.roomNumber}</li>
                <li>Tòa nhà: ${contract.buildingName}</li>
              </ul>
              <p>Vui lòng liên hệ với quản lý ký túc xá để biết thêm thông tin hoặc gia hạn hợp đồng.</p>
              <p>Xin cảm ơn,</p>
              <p>Ban Quản lý Ký túc xá</p>
            `;
            
            try {
              await sendEmail(to, subject, text, html);
              logger.info(`Đã gửi email thông báo hợp đồng hết hạn cho ${contract.email}`);
            } catch (error) {
              logger.error(`Lỗi khi gửi email thông báo hợp đồng hết hạn cho ${contract.email}:`, error);
            }
          }
        }
      } else {
        // Ghi log nếu không có hợp đồng nào hết hạn
        logger.info('Không có hợp đồng nào hết hạn cần cập nhật');
      }
    }
    
    logger.info('Hoàn tất cập nhật trạng thái hợp đồng');
  } catch (error) {
    logger.error('Lỗi khi chạy cronjob cập nhật trạng thái hợp đồng:', error);
  }
};

/**
 * Controller xử lý cập nhật trạng thái hóa đơn
 */
export const runInvoiceStatusUpdate = async () => {
  try {
    // Lấy danh sách hóa đơn được cập nhật để gửi mail
    const updatedInvoices = await updateInvoiceStatus();
    
    // Ghi log và gửi mail cho từng hóa đơn
    if (Array.isArray(updatedInvoices)) {
      logger.info(`Số hóa đơn quá hạn cần xử lý: ${updatedInvoices.length}`);
      console.log('danh sách hóa đơn quá hạn:', updatedInvoices);
      
      if (updatedInvoices.length > 0) {
        for (const invoice of updatedInvoices) {
          // Ghi log cho hóa đơn
          await logAutomatedActivity(
            'invoice_status_update', 
            'invoices', 
            `Cập nhật tự động trạng thái hóa đơn ${invoice.invoiceNumber} sang "overdue" (quá hạn)`,
            invoice.roomId,
            invoice.invoiceId
          );
          
          // Trước tiên kiểm tra tất cả sinh viên trong phòng (không lọc trạng thái)
          const [allStudentsInRoom]: any[] = await pool.query(
            `SELECT s.email, s.fullName, s.id as studentId, c.status as contractStatus, c.id as contractId
             FROM contracts c
             JOIN students s ON s.id = c.studentId 
             WHERE c.roomId = ?`,
            [invoice.roomId]
          );
          
          console.log(`Tất cả sinh viên trong phòng ${invoice.roomNumber} (bao gồm cả hợp đồng không active):`, allStudentsInRoom);
          
          // Sau đó lấy sinh viên có hợp đồng active
          const [activeStudents]: any[] = await pool.query(
            `SELECT s.email, s.fullName, s.id as studentId 
             FROM students s 
             JOIN contracts c ON s.id = c.studentId 
             WHERE c.roomId = ? AND c.status = 'active'`,
            [invoice.roomId]
          );
          
          console.log(`Sinh viên có hợp đồng active trong phòng ${invoice.roomNumber}:`, activeStudents);
          
          // Gửi mail cho tất cả sinh viên trong phòng có hợp đồng active
          if (activeStudents && activeStudents.length > 0) {
            for (const student of activeStudents) {
              if (student.email) {
                const to = {
                  Email: student.email,
                  Name: student.fullName
                };
                
                const subject = "Thông báo: Hóa đơn phòng của bạn đã quá hạn";
                const text = `Hóa đơn phòng ${invoice.roomNumber}, tòa nhà ${invoice.buildingName} đã quá hạn thanh toán`;
                const html = `
                  <h3>Xin chào ${student.fullName},</h3>
                  <p>Chúng tôi xin thông báo rằng hóa đơn phòng của bạn đã quá hạn thanh toán.</p>
                  <p><strong>Thông tin hóa đơn:</strong></p>
                  <ul>
                    <li>Mã hóa đơn: ${invoice.invoiceNumber}</li>
                    <li>Phòng: ${invoice.roomNumber}</li>
                    <li>Tòa nhà: ${invoice.buildingName}</li>
                    <li>Ngày đến hạn: ${new Date(invoice.dueDate).toLocaleDateString('vi-VN')}</li>
                    <li>Số tiền: ${Number(invoice.totalAmount).toLocaleString('vi-VN')} VNĐ</li>
                  </ul>
                  <p>Vui lòng thanh toán hóa đơn này càng sớm càng tốt để tránh phí phạt.</p>
                  <p>Xin cảm ơn,</p>
                  <p>Ban Quản lý Ký túc xá</p>
                `;
                
                try {
                  await sendEmail(to, subject, text, html);
                  logger.info(`Đã gửi email thông báo hóa đơn quá hạn cho ${student.email}`);
                } catch (error) {
                  logger.error(`Lỗi khi gửi email thông báo hóa đơn quá hạn cho ${student.email}:`, error);
                }
              }
            }
          } else {
            logger.info(`Không tìm thấy sinh viên nào trong phòng ${invoice.roomNumber} hoặc không có hợp đồng active`);
          }
        }
      } else {
        // Ghi log nếu không có hóa đơn nào quá hạn
        logger.info('Không có hóa đơn nào quá hạn cần cập nhật');
      }
    }
    
    logger.info('Hoàn tất cập nhật trạng thái hóa đơn');
  } catch (error) {
    logger.error('Lỗi khi chạy cronjob cập nhật trạng thái hóa đơn:', error);
  }
};

/**
 * Controller thực hiện cả hai cập nhật
 * Có thể gọi từ API thủ công hoặc cronjob
 */
export const runAllStatusUpdates = async (req: any, res: any) => {
  try {
    await runContractStatusUpdate();
    await runInvoiceStatusUpdate();
    
    if (res) {
      return res.json({
        success: true,
        message: 'Đã cập nhật trạng thái hợp đồng và hóa đơn thành công'
      });
    }
  } catch (error) {
    logger.error('Lỗi khi thực hiện cập nhật trạng thái:', error);
    if (res) {
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật trạng thái hợp đồng và hóa đơn',
        error: (error as Error).message
      });
    }
  }
}; 