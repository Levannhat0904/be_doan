import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import logger from "./utils/logger";
import initializeDatabase from "./scripts/initDb";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { sendEmail } from "./services/sendMail";
import { runContractStatusUpdate, runInvoiceStatusUpdate } from "./controllers/cronController";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false, // Disable for development
  })
);
app.use(
  cors({
    // origin: ['http://localhost:3001', 'http://localhost:3000', process.env.CORS_ORIGIN || '*', 'https://quan-ly-ktx-pqdlc5ijk-nhatles-projects-6a7533d6.vercel.app', "https://quan-ly-ktx-fe.vercel.app"],
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files - for uploaded images
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Log routes for debugging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Thiết lập cronjobs 30p 1 lần
cron.schedule("*/1 * * * *", async () => {
  logger.info("Đang chạy cronjob cập nhật trạng thái hợp đồng...");
  await runContractStatusUpdate();
});

cron.schedule("*/1 * * * *", async () => {
  logger.info("Đang chạy cronjob cập nhật trạng thái hóa đơn...");
  await runInvoiceStatusUpdate();
});

// Routes
app.use("/api", routes);

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "Dormitory Management System API" });
});
// app.get('/send-email', async (req, res) => {
//   try {
//     const result = await sendEmail();
//     logger.info('Email sent successfully:', result);
//     res.json({
//       success: true,
//       message: 'Email sent successfully',
//       data: result
//     });
//   } catch (error: any) {
//     logger.error('Email sending failed:', {
//       statusCode: error.statusCode,
//       message: error.message,
//       response: error.response?.body
//     });
//     res.status(500).json({
//       success: false,
//       error: 'Failed to send email',
//       details: {
//         statusCode: error.statusCode,
//         message: error.message,
//         response: error.response?.body
//       }
//     });
//   }
// });

// Database initialization route (should be protected in production)
app.post("/init-db", async (req, res) => {
  try {
    await initializeDatabase();
    res.json({ message: "Database initialized successfully" });
  } catch (error) {
    logger.error("Database initialization failed:", error);
    res.status(500).json({ error: "Failed to initialize database" });
  }
});

// Error handling middleware
app.use(errorHandler);
// test sendEmail
app.get("/test-send-email", async (req, res) => {
  const payload = {
    to: {
      Email: "hiamnhatdz203@gmail.com",
      Name: "Nhat",
    },
    subject: "Test email",
    text: "This is a test email",
    html: "<h3>Hello, welcome to Mailjet!</h3><br />This is an HTML email.",
  };
  try {
    const result = await sendEmail(
      payload.to,
      payload.subject,
      payload.text,
      payload.html
    );
    res.json({ message: "Email sent successfully", data: result });
  } catch (error) {
    logger.error("Email sending failed:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`API available at http://localhost:${PORT}/api`);
  logger.info(`Cronjobs đã được thiết lập: Cập nhật trạng thái hợp đồng và hóa đơn hàng ngày`);
});

export default app;
