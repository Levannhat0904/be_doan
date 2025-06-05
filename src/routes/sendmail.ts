import express, { Request, Response } from "express";
import { sendMail } from "../controllers/sendMail";

const router = express.Router();

router.post('/send-mail/contact', async (req: Request, res: Response) => {
  const { to, subject, text, html } = req.body;
  const result = await sendMail(to, subject, text, html);
  res.json({ message: "Email sent successfully", data: result });
});

export default router;