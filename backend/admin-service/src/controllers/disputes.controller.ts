import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { createNotification } from '../notifications';
import { getIO } from '../websocket';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';



export const getDisputes = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let baseQuery = `
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users u1 ON d.opened_by = u1.id
      LEFT JOIN users u3 ON d.assigned_to = u3.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'All') {
      params.push(status.toLowerCase());
      baseQuery += ` AND d.status = $${params.length}`;
    }

    const countRes = await readDb.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT d.*,
             o.order_number,
             u1.full_name as customer_name,
             u3.full_name as assigned_to_name
      ${baseQuery}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await readDb.query(dataQuery, params);
    res.json({ data: result.rows, total, page, limit });
  } catch (error: any) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDisputeStats = async (req: Request, res: Response) => {
  try {
    const stats = await readDb.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as pending,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved
      FROM disputes
    `);
    res.json(stats.rows[0]);
  } catch (error: any) {
    console.error('Error fetching dispute stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateDisputeStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, resolution_note } = req.body;
  const admin_id = (req as any).user?.id;

  try {
    const query = `
      UPDATE disputes 
      SET status = $1, 
          resolution_note = $2, 
          resolved_at = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const resolvedAt = status === 'resolved' ? new Date() : null;
    const result = await db.query(query, [status, resolution_note, resolvedAt, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const dispute = result.rows[0];

    // Notify Customer about status change
    try {
      let title = 'Update Status Dispute';
      let body = `Status tiket dispute Anda berubah menjadi: ${status.toUpperCase()}`;
      
      if (status === 'resolved') {
        title = 'Dispute Terselesaikan';
        body = `Tiket dispute Anda telah diselesaikan oleh Admin. Catatan: ${resolution_note || 'Tidak ada catatan'}`;
      } else if (status === 'investigating') {
        title = 'Dispute Sedang Diinvestigasi';
        body = 'Admin sedang meninjau laporan Anda. Mohon tunggu update selanjutnya.';
      }

      await createNotification({
        user_id: dispute.opened_by,
        title,
        body,
        type: 'dispute_update',
        order_id: dispute.order_id,
        metadata: {
          dispute_id: id,
          status
        },
        deep_link: `/orders/${dispute.order_id}`
      });
    } catch (notifError) {
      console.warn('[Dispute] Failed to notify customer:', notifError);
    }

    res.json(dispute);
  } catch (error: any) {
    console.error('Error updating dispute status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const assignDispute = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { admin_id } = req.body;
  try {
    const query = `
      UPDATE disputes 
      SET assigned_to = $1, 
          status = 'investigating',
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [admin_id, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error assigning dispute:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createDispute = async (req: Request, res: Response) => {
  const { order_id, category, description, evidence_urls } = req.body;
  const user_id = (req as any).user?.id;

  if (!order_id || !category || !description) {
    return res.status(400).json({ error: 'Order ID, category, and description are required' });
  }

  try {
    const query = `
      INSERT INTO disputes (order_id, opened_by, category, description, evidence_urls, status)
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING *
    `;
    const result = await db.query(query, [order_id, user_id, category, description, evidence_urls || []]);
    
    // Add an audit log or order event if needed
    await db.query(`
      INSERT INTO order_events (order_id, event_type, description)
      VALUES ($1, 'DISPUTE_OPENED', $2)
    `, [order_id, `Dispute opened for ${category}: ${description.substring(0, 50)}...`]);

    // Notify Admins
    try {
      const adminRes = await db.query(`
        SELECT id FROM staff WHERE role IN ('ops_admin', 'super_admin', 'cs_agent') AND status = 'active'
      `);
      
      const adminNotifications = adminRes.rows.map((admin: any) => 
        createNotification({
          user_id: admin.id,
          title: 'Tiket Dispute Baru',
          body: `Order ${order_id.substring(0, 8)}: ${category}`,
          type: 'dispute',
          order_id: order_id,
          metadata: {
            dispute_id: result.rows[0].id,
            category
          },
          deep_link: '/disputes'
        })
      );
      
      await Promise.all(adminNotifications);
    } catch (notifError) {
      console.warn('[Dispute] Failed to notify admins:', notifError);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCustomerDisputes = async (req: Request, res: Response) => {
  const user_id = (req as any).user?.id;
  try {
    const result = await readDb.query(`
      SELECT d.*, o.order_number 
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      WHERE d.opened_by = $1
      ORDER BY d.created_at DESC
    `, [user_id]);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getDisputeChats = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await readDb.query(`
      SELECT c.*, u.full_name as sender_name, u.role as sender_role
      FROM dispute_chats c
      JOIN users u ON c.sender_id = u.id
      WHERE c.dispute_id = $1
      ORDER BY c.created_at ASC
    `, [id]);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadDisputeFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const savedUpload = saveSecureUploadBuffer(req.file, 'disputes');
    res.json({ success: true, url: savedUpload.fileUrl });
  } catch (error: any) {
    console.error('Error uploading dispute file:', error);
    res.status(500).json({ error: error.message });
  }
};

export const sendDisputeChat = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message, message_type = 'text' } = req.body;
  const sender_id = (req as any).user?.id;

  try {
    const result = await db.query(`
      INSERT INTO dispute_chats (dispute_id, sender_id, message, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, sender_id, message, message_type]);

    const chatMsg = result.rows[0];

    const disputeRes = await db.query(`
      SELECT d.*, o.order_number 
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      WHERE d.id = $1
    `, [id]);
    
    if (disputeRes.rowCount === 0) return res.status(404).json({ error: 'Dispute not found' });
    const dispute = disputeRes.rows[0];

    const isCustomerSender = sender_id === dispute.opened_by;

    // Emit via Socket to the dispute room
    try {
      const io = getIO();
      io.to(id).emit('new_dispute_chat', {
        ...chatMsg,
        sender_name: (req as any).user?.full_name || 'User',
        sender_role: (req as any).user?.role
      });
    } catch (wsError) {
      console.warn('[WebSocket] Could not emit dispute chat message:', wsError);
    }

    // Bidirectional Notification Logic
    const notificationBody = message_type === 'image' ? '📸 [Gambar]' : message.substring(0, 50) + '...';

    if (isCustomerSender) {
        // Customer -> Admin
        if (dispute.assigned_to) {
            await createNotification({
                user_id: dispute.assigned_to,
                title: 'Pesan Dispute Baru',
                body: `Customer: ${notificationBody}`,
                type: 'dispute_chat',
                order_id: dispute.order_id,
                metadata: { dispute_id: id },
                deep_link: '/disputes'
            });
        } else {
            const adminRes = await db.query("SELECT id FROM users WHERE role IN ('ops_admin', 'super_admin', 'cs_agent') AND status = 'active'");
            for (const admin of adminRes.rows) {
                await createNotification({
                    user_id: admin.id,
                    title: 'Pesan Dispute (Unassigned)',
                    body: `Order ${dispute.order_number}: ${notificationBody}`,
                    type: 'dispute_chat',
                    order_id: dispute.order_id,
                    metadata: { dispute_id: id },
                    deep_link: '/disputes'
                });
            }
        }
    } else {
        // Admin -> Customer
        await createNotification({
            user_id: dispute.opened_by,
            title: 'Pesan Baru dari Admin',
            body: `Admin: ${notificationBody}`,
            type: 'dispute_chat',
            order_id: dispute.order_id,
            metadata: { dispute_id: id },
            deep_link: `/orders/${dispute.order_id}`
        });
    }

    res.json({ success: true, data: chatMsg });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
