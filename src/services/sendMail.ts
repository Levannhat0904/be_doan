import Mailjet from 'node-mailjet';
import dotenv from 'dotenv';

dotenv.config();

const MAILJET_API_KEY = process.env.MAILJET_API_KEY || "8f0d160672ad22e69ded697d0838ec37";
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY || "d2e242908ae1eb4b5f6cb2cd38c15e56";
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'mztony86@gmail.com';
const SENDER_NAME = process.env.SENDER_NAME || 'Quan ly KTX';

const mailjet = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_SECRET_KEY);

async function sendEmail() {
  try {
    const request = await mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [
          {
            From: {
              Email: SENDER_EMAIL,
              Name: SENDER_NAME,
            },
            To: [
              {
                Email: 'hiamnhatdz203@gmail.com',
                Name: 'Nhat',
              },
            ],
            Subject: 'Hello from Mailjet (TypeScript)',
            TextPart: 'This is a plain text version of the message',
            HTMLPart: '<h3>Hello, welcome to Mailjet!</h3><br />This is an HTML email.',
          },
        ],
      });

    if (!request.body) {
      throw new Error('No response from Mailjet');
    }

    console.log('Email sent successfully:', request.body);
    return request.body;
  } catch (err: any) {
    console.error('Error sending email:', {
      statusCode: err.statusCode,
      message: err.message,
      response: err.response?.body
    });
    throw err; // Re-throw the error so it can be caught by the caller
  }
}

export default sendEmail;
