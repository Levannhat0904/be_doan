import { Request, Response } from "express";
import pool from "../config/database";
import { RowDataPacket, OkPacket } from "mysql2";
import activityLogService from "../services/activityLogService";
import { format } from "date-fns";

export const createContract = async (req: Request, res: Response) => {
  try {
    const { studentId, roomId, startDate, endDate, depositAmount, monthlyFee } =
      req.body;

    // Validate required fields
    if (
      !studentId ||
      !roomId ||
      !startDate ||
      !endDate ||
      !depositAmount ||
      !monthlyFee
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin hợp đồng",
      });
    }

    // Kiểm tra trạng thái sinh viên trước khi tạo hợp đồng
    const [studentStatus] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM students WHERE id = ?`,
      [studentId]
    );

    if (!studentStatus.length) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên không tồn tại",
      });
    }

    // Kiểm tra nếu sinh viên chưa được phê duyệt thì không thể tạo hợp đồng active
    if (studentStatus[0].status !== "active") {
      // Cập nhật trạng thái sinh viên sang active
      await pool.query("START TRANSACTION");

      try {
        // Cập nhật trạng thái sinh viên
        await pool.query(`UPDATE students SET status = 'active' WHERE id = ?`, [
          studentId,
        ]);

        // Cập nhật trạng thái user liên quan
        const [studentUser] = await pool.query<RowDataPacket[]>(
          `SELECT userId FROM students WHERE id = ?`,
          [studentId]
        );

        if (studentUser.length && studentUser[0].userId) {
          await pool.query(`UPDATE users SET status = 'active' WHERE id = ?`, [
            studentUser[0].userId,
          ]);
        }

        // Ghi log
        await pool.query(
          `INSERT INTO activity_logs (userId, action, entityType, entityId, description)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.user?.id || 1,
            "update_status",
            "student",
            studentId,
            'Cập nhật trạng thái sinh viên thành "active" khi tạo hợp đồng',
          ]
        );

        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }

    // Check if the room is available (not full)
    const [roomStatus] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.currentOccupancy, r.capacity, r.status, r.roomType, 
              s.gender 
       FROM rooms r
       LEFT JOIN students s ON s.id = ?
       WHERE r.id = ?`,
      [studentId, roomId]
    );

    if (!roomStatus.length) {
      return res.status(400).json({
        success: false,
        message: "Phòng không tồn tại",
      });
    }

    if (roomStatus[0].status === "maintenance") {
      return res.status(400).json({
        success: false,
        message: "Phòng đang bảo trì, không thể tạo hợp đồng",
      });
    }

    if (roomStatus[0].currentOccupancy >= roomStatus[0].capacity) {
      return res.status(400).json({
        success: false,
        message: "Phòng đã đầy, không thể tạo hợp đồng",
      });
    }

    // Check if room type matches student gender
    if (
      roomStatus[0].roomType === "male" &&
      roomStatus[0].gender === "female"
    ) {
      return res.status(400).json({
        success: false,
        message: "Phòng nam không thể xếp cho sinh viên nữ",
      });
    }

    if (
      roomStatus[0].roomType === "female" &&
      roomStatus[0].gender === "male"
    ) {
      return res.status(400).json({
        success: false,
        message: "Phòng nữ không thể xếp cho sinh viên nam",
      });
    }

    // Check if student already has an active contract
    const [existingContract] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM contracts 
       WHERE studentId = ? AND status = 'active'`,
      [studentId]
    );

    if (existingContract.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Sinh viên đã có hợp đồng đang hoạt động",
      });
    }

    // Generate contract number
    const contractNumber = `CTR-${studentId}-${roomId}-${Date.now()}`;

    // Get admin ID from request (assuming it's set by authMiddleware)
    const createdBy = req.user?.id || 1; // Fallback to admin ID 1 if user is undefined

    // Insert contract
    const [result] = await pool.query<OkPacket>(
      `INSERT INTO contracts 
       (contractNumber, studentId, roomId, startDate, endDate, 
        depositAmount, monthlyFee, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contractNumber,
        studentId,
        roomId,
        new Date(startDate),
        new Date(endDate),
        depositAmount,
        monthlyFee,
        "active",
        req.user?.id,
      ]
    );

    // Begin transaction for updating room
    await pool.query("START TRANSACTION");

    try {
      // Update room occupancy
      await pool.query(
        `UPDATE rooms SET currentOccupancy = currentOccupancy + 1 WHERE id = ?`,
        [roomId]
      );

      // Check if room is full after adding this contract
      const [updatedRoomInfo] = await pool.query<RowDataPacket[]>(
        `SELECT currentOccupancy, capacity FROM rooms WHERE id = ?`,
        [roomId]
      );

      if (
        updatedRoomInfo.length &&
        updatedRoomInfo[0].currentOccupancy >= updatedRoomInfo[0].capacity
      ) {
        await pool.query(`UPDATE rooms SET status = 'full' WHERE id = ?`, [
          roomId,
        ]);
      }

      // Commit the transaction
      await pool.query("COMMIT");
    } catch (error) {
      // Rollback in case of error
      await pool.query("ROLLBACK");
      throw error;
    }

    // Get student and room details for logging
    const [details] = await pool.query<RowDataPacket[]>(
      `SELECT s.fullName, s.studentCode, r.roomNumber, b.name as buildingName, r.id as roomId
       FROM students s
       JOIN rooms r ON r.id = ?
       JOIN buildings b ON b.id = r.buildingId
       WHERE s.id = ?`,
      [roomId, studentId]
    );

    // Log activity
    if (req.user?.id && details.length > 0) {
      const detail = details[0];
      const activityDescription = `Tạo hợp đồng: ${contractNumber} cho sinh viên ${detail.fullName} (${detail.studentCode}) ở phòng ${detail.roomNumber}, ${detail.buildingName}`;

      // Log to contract entity
      await activityLogService.logActivity(
        req.user.id,
        "create",
        "contract",
        result.insertId,
        activityDescription,
        req
      );

      // Log to room entity for room timeline
      await activityLogService.logActivity(
        req.user.id,
        "add",
        "room",
        detail.roomId,
        `Sinh viên ${detail.fullName} (${detail.studentCode}) được thêm vào phòng ${detail.roomNumber} tòa ${detail.buildingName}`,
        req
      );
    }

    return res.status(201).json({
      success: true,
      message: "Tạo hợp đồng thành công",
      data: {
        id: result.insertId,
        contractNumber,
      },
    });
  } catch (error) {
    console.error("Error creating contract:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi tạo hợp đồng",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getContractsByStudent = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    // Kiểm tra ID sinh viên
    if (!studentId || isNaN(Number(studentId))) {
      return res
        .status(400)
        .json({ success: false, message: "ID sinh viên không hợp lệ" });
    }

    // Lấy danh sách hợp đồng
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       WHERE c.studentId = ?
       ORDER BY c.startDate DESC`,
      [studentId]
    );

    return res.status(200).json({ success: true, data: contracts });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi khi truy vấn hợp đồng" });
  }
};

export const getAllContracts = async (req: Request, res: Response) => {
  try {
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       ORDER BY c.createdAt DESC`
    );

    return res.status(200).json({ success: true, data: contracts });
  } catch (error) {
    console.error("Error fetching all contracts:", error);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi khi truy vấn hợp đồng" });
  }
};

export const getContractById = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res
        .status(400)
        .json({ success: false, message: "ID hợp đồng không hợp lệ" });
    }

    // Fetch contract with related information
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, 
          r.roomNumber, r.floorNumber, r.pricePerMonth,
          b.name as buildingName,
          s.fullName, s.studentCode, s.phone, s.email, s.faculty, s.className
       FROM contracts c
       JOIN rooms r ON c.roomId = r.id
       JOIN buildings b ON r.buildingId = b.id
       JOIN students s ON c.studentId = s.id
       WHERE c.id = ?`,
      [contractId]
    );

    if (!contracts.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    return res.status(200).json({ success: true, data: contracts[0] });
  } catch (error) {
    console.error("Error fetching contract details:", error);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi khi truy vấn hợp đồng" });
  }
};

export const updateContract = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { startDate, endDate, depositAmount, monthlyFee, roomId, status } =
      req.body;

    console.log("Update Contract Request:", {
      contractId,
      params: req.params,
      body: req.body,
      startDate,
      endDate,
      depositAmount,
      monthlyFee,
      roomId,
      status,
    });

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res
        .status(400)
        .json({ success: false, message: "ID hợp đồng không hợp lệ" });
    }

    // Check if contract exists
    const [existingContract] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, s.status as studentStatus, s.userId 
       FROM contracts c
       JOIN students s ON c.studentId = s.id
       WHERE c.id = ?`,
      [contractId]
    );

    if (!existingContract.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    console.log("Existing Contract:", existingContract[0]);

    // Begin transaction
    await pool.query("START TRANSACTION");

    try {
      // Nếu đang cập nhật hợp đồng thành active và sinh viên chưa active
      if (
        status === "active" &&
        existingContract[0].studentStatus !== "active"
      ) {
        // Cập nhật trạng thái sinh viên
        await pool.query(`UPDATE students SET status = 'active' WHERE id = ?`, [
          existingContract[0].studentId,
        ]);

        // Cập nhật trạng thái user liên quan
        if (existingContract[0].userId) {
          await pool.query(`UPDATE users SET status = 'active' WHERE id = ?`, [
            existingContract[0].userId,
          ]);
        }

        // Ghi log
        await pool.query(
          `INSERT INTO activity_logs (userId, action, entityType, entityId, description)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.user?.id || 1,
            "update_status",
            "student",
            existingContract[0].studentId,
            'Cập nhật trạng thái sinh viên thành "active" khi cập nhật hợp đồng',
          ]
        );
      }

      // Prepare update values
      const newStartDate = startDate
        ? new Date(startDate)
        : existingContract[0].startDate;
      const newEndDate = endDate
        ? new Date(endDate)
        : existingContract[0].endDate;
      const newDepositAmount =
        depositAmount || existingContract[0].depositAmount;
      const newMonthlyFee = monthlyFee || existingContract[0].monthlyFee;
      const newStatus = status || existingContract[0].status;
      const newRoomId = roomId ? Number(roomId) : existingContract[0].roomId;

      console.log("Update Values:", {
        newStartDate,
        newEndDate,
        newDepositAmount,
        newMonthlyFee,
        newStatus,
        newRoomId,
        oldRoomId: existingContract[0].roomId,
      });

      // Check if room is changed
      const isRoomChanged = newRoomId !== existingContract[0].roomId;

      // If room is changed, check if the new room is available
      if (isRoomChanged) {
        console.log("Room is changed, checking new room availability");

        // Check if the new room exists and is not full
        const [newRoomInfo] = await pool.query<RowDataPacket[]>(
          `SELECT id, currentOccupancy, capacity, status FROM rooms WHERE id = ?`,
          [newRoomId]
        );

        console.log("New room info:", newRoomInfo[0]);

        if (!newRoomInfo.length) {
          await pool.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Phòng mới không tồn tại",
          });
        }

        if (newRoomInfo[0].status === "maintenance") {
          await pool.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Phòng mới đang bảo trì, không thể chuyển sinh viên vào",
          });
        }

        if (newRoomInfo[0].currentOccupancy >= newRoomInfo[0].capacity) {
          await pool.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Phòng mới đã đầy, không thể chuyển sinh viên vào",
          });
        }
      }

      // Update contract
      const [updateResult] = await pool.query<OkPacket>(
        `UPDATE contracts 
         SET startDate = ?, endDate = ?, depositAmount = ?, monthlyFee = ?, 
             status = ?, roomId = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          newStartDate,
          newEndDate,
          newDepositAmount,
          newMonthlyFee,
          newStatus,
          newRoomId,
          contractId,
        ]
      );

      console.log("Update Result:", updateResult);

      // If room is changed, update both rooms' occupancy
      if (isRoomChanged && existingContract[0].status === "active") {
        console.log("Updating room occupancy after room change");

        // Decrease old room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?`,
          [existingContract[0].roomId]
        );

        // Update old room status if it was full
        await pool.query(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND status = 'full'`,
          [existingContract[0].roomId]
        );

        // Increase new room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy + 1 WHERE id = ?`,
          [newRoomId]
        );

        // Check if new room is full after adding this contract
        const [updatedNewRoomInfo] = await pool.query<RowDataPacket[]>(
          `SELECT currentOccupancy, capacity FROM rooms WHERE id = ?`,
          [newRoomId]
        );

        if (
          updatedNewRoomInfo.length &&
          updatedNewRoomInfo[0].currentOccupancy >=
            updatedNewRoomInfo[0].capacity
        ) {
          await pool.query(`UPDATE rooms SET status = 'full' WHERE id = ?`, [
            newRoomId,
          ]);
        }
      }
      // If contract is terminated, update room occupancy
      else if (
        status === "terminated" &&
        existingContract[0].status !== "terminated"
      ) {
        // Update room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?`,
          [existingContract[0].roomId]
        );

        // Update room status if it was full
        await pool.query(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND status = 'full'`,
          [existingContract[0].roomId]
        );
      }

      // Commit changes
      await pool.query("COMMIT");

      // Get contract details for logging
      const [details] = await pool.query<RowDataPacket[]>(
        `SELECT c.contractNumber, s.fullName, s.studentCode, r.roomNumber, b.name as buildingName,
                r.id as roomId, c.roomId as oldRoomId, s.id as studentId
         FROM contracts c
         JOIN students s ON s.id = c.studentId
         JOIN rooms r ON r.id = c.roomId
         JOIN buildings b ON b.id = r.buildingId
         WHERE c.id = ?`,
        [contractId]
      );

      // Log activity
      if (req.user?.id && details.length > 0) {
        const detail = details[0];
        // Build a detailed changes description
        let changesDescription = "";

        if (status && status !== existingContract[0].status) {
          changesDescription += `Trạng thái thay đổi từ ${existingContract[0].status} thành ${status}`;
        } else if (isRoomChanged) {
          // Room change was already handled separately with more detailed logs
          changesDescription += `Chuyển phòng`;
        } else {
          const changes = [];

          if (startDate) {
            changes.push(`ngày bắt đầu: ${format(newStartDate, "dd/MM/yyyy")}`);
          }

          if (endDate) {
            changes.push(`ngày kết thúc: ${format(newEndDate, "dd/MM/yyyy")}`);
          }

          if (
            depositAmount &&
            depositAmount !== existingContract[0].depositAmount
          ) {
            changes.push(
              `tiền đặt cọc: ${Number(depositAmount).toLocaleString(
                "vi-VN"
              )} VNĐ`
            );
          }

          if (monthlyFee && monthlyFee !== existingContract[0].monthlyFee) {
            changes.push(
              `phí hàng tháng: ${Number(monthlyFee).toLocaleString(
                "vi-VN"
              )} VNĐ`
            );
          }

          changesDescription =
            changes.length > 0
              ? `Cập nhật ${changes.join(", ")}`
              : "Cập nhật thông tin hợp đồng";
        }

        // Log to contract entity
        await activityLogService.logActivity(
          req.user.id,
          "update",
          "contract",
          Number(contractId),
          `Cập nhật hợp đồng: ${detail.contractNumber} - ${changesDescription}`,
          req
        );

        // Explicitly log to room timeline with detailed changes
        await activityLogService.logActivity(
          req.user.id,
          "update",
          "room",
          newRoomId,
          `Cập nhật hợp đồng cho sinh viên ${detail.fullName} (${detail.studentCode}) ở phòng ${detail.roomNumber} tòa ${detail.buildingName}: ${changesDescription}`,
          req
        );

        // Additional logging for room changes
        if (isRoomChanged) {
          // Get old room details
          const [oldRoomDetails] = await pool.query<RowDataPacket[]>(
            `SELECT r.roomNumber, b.name as buildingName
             FROM rooms r
             JOIN buildings b ON b.id = r.buildingId
             WHERE r.id = ?`,
            [existingContract[0].roomId]
          );

          if (oldRoomDetails.length > 0) {
            const oldRoom = oldRoomDetails[0];

            // Log student room change for the old room's timeline
            await activityLogService.logActivity(
              req.user.id,
              "update",
              "room",
              existingContract[0].roomId,
              `Sinh viên ${detail.fullName} (${detail.studentCode}) chuyển đi khỏi phòng ${oldRoom.roomNumber} tòa ${oldRoom.buildingName}`,
              req
            );

            // Log student room change for the new room's timeline
            await activityLogService.logActivity(
              req.user.id,
              "update",
              "room",
              newRoomId,
              `Sinh viên ${detail.fullName} (${detail.studentCode}) chuyển đến phòng ${detail.roomNumber} tòa ${detail.buildingName}`,
              req
            );
          }
        }

        // Log when a student is added to a room (new active contract)
        if (status === "active" && existingContract[0].status !== "active") {
          await activityLogService.logActivity(
            req.user.id,
            "add",
            "room",
            detail.roomId,
            `Sinh viên ${detail.fullName} (${detail.studentCode}) được thêm vào phòng ${detail.roomNumber} tòa ${detail.buildingName}`,
            req
          );
        }

        // Log when a student is removed from a room (contract terminated)
        if (
          status === "terminated" &&
          existingContract[0].status !== "terminated"
        ) {
          await activityLogService.logActivity(
            req.user.id,
            "remove",
            "room",
            detail.roomId,
            `Sinh viên ${detail.fullName} (${detail.studentCode}) bị xóa khỏi phòng ${detail.roomNumber} tòa ${detail.buildingName}`,
            req
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: "Cập nhật hợp đồng thành công",
        data: { id: Number(contractId) },
      });
    } catch (error) {
      // Rollback if there's an error
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error updating contract:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật hợp đồng",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteContract = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // Validate ID
    if (!contractId || isNaN(Number(contractId))) {
      return res
        .status(400)
        .json({ success: false, message: "ID hợp đồng không hợp lệ" });
    }

    // Get contract details before deletion
    const [contract] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM contracts WHERE id = ?`,
      [contractId]
    );

    if (!contract.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    // Begin transaction
    await pool.query("START TRANSACTION");

    try {
      // Delete contract
      const [result] = await pool.query<OkPacket>(
        `DELETE FROM contracts WHERE id = ?`,
        [contractId]
      );

      if (result.affectedRows === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy hợp đồng" });
      }

      // Update room occupancy if contract was active
      if (contract[0].status === "active") {
        // Update room occupancy
        await pool.query(
          `UPDATE rooms SET currentOccupancy = currentOccupancy - 1 WHERE id = ?`,
          [contract[0].roomId]
        );

        // Update room status if it was full
        await pool.query(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND status = 'full'`,
          [contract[0].roomId]
        );
      }

      // Commit changes
      await pool.query("COMMIT");

      // Get contract details for logging
      const [details] = await pool.query<RowDataPacket[]>(
        `SELECT s.fullName, s.studentCode, r.roomNumber, b.name as buildingName, r.id as roomId
         FROM students s
         JOIN rooms r ON r.id = ?
         JOIN buildings b ON b.id = r.buildingId
         WHERE s.id = ?`,
        [contract[0].roomId, contract[0].studentId]
      );

      // Log activity
      if (req.user?.id && details.length > 0) {
        const detail = details[0];
        const activityDescription = `Xóa hợp đồng: ${contract[0].contractNumber} của sinh viên ${detail.fullName} (${detail.studentCode}) ở phòng ${detail.roomNumber}, ${detail.buildingName}`;

        // Log to contract entity
        await activityLogService.logActivity(
          req.user.id,
          "delete",
          "contract",
          Number(contractId),
          activityDescription,
          req
        );

        // Log to room entity for room timeline
        if (contract[0].status === "active") {
          await activityLogService.logActivity(
            req.user.id,
            "remove",
            "room",
            detail.roomId,
            `Sinh viên ${detail.fullName} (${detail.studentCode}) bị xóa khỏi phòng ${detail.roomNumber} tòa ${detail.buildingName} (hợp đồng đã xóa)`,
            req
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: "Xóa hợp đồng thành công",
      });
    } catch (error) {
      // Rollback if there's an error
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting contract:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa hợp đồng",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get contract timeline history
 * This function retrieves all activity logs related to a specific contract
 */
export const getContractTimeline = async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    if (!contractId || isNaN(Number(contractId))) {
      return res.status(400).json({
        success: false,
        message: "ID hợp đồng không hợp lệ",
      });
    }

    // Main query to get all activity logs related to the contract
    const timelineQuery = `
      SELECT 
        al.id,
        al.action,
        al.entityType,
        al.entityId,
        al.description,
        al.createdAt as timestamp,
        CASE 
          WHEN u.userType = 'admin' THEN a.fullName
          WHEN u.userType = 'student' THEN s.fullName
          ELSE 'System'
        END as userName,
        u.userType,
        a.avatarPath as adminAvatar,
        s.avatarPath as studentAvatar
      FROM activity_logs al
      LEFT JOIN users u ON al.userId = u.id
      LEFT JOIN admins a ON u.id = a.userId AND u.userType = 'admin'
      LEFT JOIN students s ON u.id = s.userId AND u.userType = 'student'
      WHERE 
        (al.entityType = 'contract' AND al.entityId = ?)
      ORDER BY al.createdAt DESC
    `;

    // Execute the query with parameters
    const [timelineRows] = await pool.query<RowDataPacket[]>(timelineQuery, [
      contractId,
    ]);

    // Format the timeline data
    const timeline = (timelineRows as RowDataPacket[]).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      description: row.description,
      timestamp: row.timestamp,
      userName: row.userName,
      userType: row.userType,
      userAvatar:
        row.userType === "admin" ? row.adminAvatar : row.studentAvatar,
    }));

    return res.status(200).json({
      success: true,
      data: timeline,
    });
  } catch (error: any) {
    console.error("Error fetching contract timeline:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi tải lịch sử hoạt động",
      error: error.message,
    });
  }
};
