import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';

export const createProduct = async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/products`,
      req.body,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const listProducts = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/products`,
      {
        params: req.query,
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/products/${req.params.id}`,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const response = await axios.put(
      `${ORDER_SERVICE_URL}/api/v1/products/${req.params.id}`,
      req.body,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const response = await axios.delete(
      `${ORDER_SERVICE_URL}/api/v1/products/${req.params.id}`,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const bulkUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);

    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/products/bulk`,
      formData,
      {
        headers: {
          'X-User-ID': req.user?.id,
          ...formData.getHeaders(),
        },
      }
    );
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.status(response.status).json(response.data);
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};
