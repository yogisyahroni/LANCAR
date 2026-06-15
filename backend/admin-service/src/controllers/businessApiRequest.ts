import { Request, Response } from 'express';
import { 
  createBusinessApiRequest as createRequestSvc,
  getBusinessApiRequests as getRequestsSvc,
  getBusinessApiRequestById as getRequestByIdSvc,
  updateBusinessApiRequestStatus as updateStatusSvc,
  BusinessApiRequestSchema
} from '../services/businessApiRequest';
import { getIO } from '../websocket';
import { securityLog } from '../security/logRedaction';

export const createBusinessApiRequest = async (req: Request, res: Response) => {
  try {
    const validatedData = BusinessApiRequestSchema.parse(req.body);
    const newRequest = await createRequestSvc(validatedData);

    // Notify admins via WebSocket
    try {
      const io = getIO();
      // Broadcast to a specific room 'admin_alerts' or emit globally to all connected admins
      io.emit('new_api_request', {
        id: newRequest.id,
        company_name: newRequest.company_name,
        contact_email: newRequest.contact_email,
        status: newRequest.status,
        created_at: newRequest.created_at,
      });
    } catch (wsError) {
      securityLog.warn('Failed to emit WebSocket event for new API request', { error: wsError });
    }

    return res.status(201).json({
      status: 'success',
      data: newRequest,
      message: 'API request submitted successfully',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        status: 'error',
        code: 'ERR_VALIDATION',
        message: 'Invalid request data',
        errors: error.errors,
      });
    }
    securityLog.error('Failed to create business API request', { error });
    return res.status(500).json({
      status: 'error',
      code: 'ERR_INTERNAL',
      message: 'Failed to submit request',
    });
  }
};

export const getBusinessApiRequests = async (req: Request, res: Response) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await getRequestsSvc(
      status as string, 
      limit ? parseInt(limit as string, 10) : 50, 
      offset ? parseInt(offset as string, 10) : 0
    );
    
    return res.status(200).json({
      status: 'success',
      data: result.data,
      total: result.total,
    });
  } catch (error) {
    securityLog.error('Failed to fetch business API requests', { error });
    return res.status(500).json({
      status: 'error',
      code: 'ERR_INTERNAL',
      message: 'Failed to fetch API requests',
    });
  }
};

export const getBusinessApiRequestById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const request = await getRequestByIdSvc(id);
    if (!request) {
      return res.status(404).json({
        status: 'error',
        code: 'ERR_NOT_FOUND',
        message: 'API request not found',
      });
    }
    return res.status(200).json({
      status: 'success',
      data: request,
    });
  } catch (error) {
    securityLog.error('Failed to fetch business API request by ID', { error, id: req.params.id });
    return res.status(500).json({
      status: 'error',
      code: 'ERR_INTERNAL',
      message: 'Failed to fetch API request',
    });
  }
};

export const reviewBusinessApiRequest = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { action } = req.params; // approve or reject
    const { notes } = req.body;
    const adminId = req.headers['x-user-id'] as string; // from requireAuth middleware

    if (!adminId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    let newStatus: 'APPROVED' | 'REJECTED';
    if (action === 'approve') newStatus = 'APPROVED';
    else if (action === 'reject') newStatus = 'REJECTED';
    else return res.status(400).json({ status: 'error', message: 'Invalid action' });

    const updatedRequest = await updateStatusSvc(id, newStatus, adminId, notes);
    
    if (!updatedRequest) {
      return res.status(404).json({
        status: 'error',
        code: 'ERR_NOT_FOUND',
        message: 'API request not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: updatedRequest,
      message: `API request ${newStatus.toLowerCase()} successfully`,
    });
  } catch (error) {
    securityLog.error('Failed to review business API request', { error, id: req.params.id });
    return res.status(500).json({
      status: 'error',
      code: 'ERR_INTERNAL',
      message: 'Failed to review API request',
    });
  }
};
