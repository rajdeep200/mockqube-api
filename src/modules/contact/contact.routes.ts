import { Router } from 'express';
import type { Request } from 'express';
import { createContactMessageSchema } from './contact.schema.js';
import { createContactMessage } from '../../services/contact/contact.service.js';
import { ApiError } from '../../common/api-error.js';
import { contactEmailRateLimit, contactIpRateLimit } from '../../middleware/rate-limit.js';

const router = Router();

function getRequestIp(req: Request): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim();
  }
  return req.ip || undefined;
}


function getUserAgent(req: Request): string | undefined {
  const userAgent = req.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : undefined;
}
/**
 * @openapi
 * /v1/contact/messages:
 *   post:
 *     tags: [Contact]
 *     summary: Submit contact form message
 *     description: Public endpoint used by the frontend Contact Us form.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 254
 *               message:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *           examples:
 *             basic:
 *               value:
 *                 name: Jane Doe
 *                 email: jane@example.com
 *                 message: I would like to know more about MockQube enterprise pricing.
 *     responses:
 *       201:
 *         description: Contact message stored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *             example:
 *               success: true
 *               message: Your message has been received
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit/spam protection triggered
 */
router.post('/messages', contactIpRateLimit, contactEmailRateLimit, async (req, res, next) => {
  try {
    const parsed = createContactMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request payload', parsed.error.flatten().fieldErrors);
    }

    await createContactMessage(parsed.data, {
      ip: getRequestIp(req),
      userAgent: getUserAgent(req)
    });

    return res.status(201).json({
      success: true,
      message: 'Your message has been received'
    });
  } catch (error) {
    return next(error);
  }
});

export const contactRouter = router;
