// send mail

import { sendEmail } from "../services/sendMail";

export const sendMail = async (to: {
  Email: string,
  Name: string
}, subject: string, text: string, html: string) => {
  const payload = {
    to,
    subject,
    text,
    html,
  };
  try {
    const result = await sendEmail(payload.to, payload.subject, payload.text, payload.html);
    return result;
  } catch (error) {
    throw error;
  }
};