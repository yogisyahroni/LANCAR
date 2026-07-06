import { Request, Response } from 'express';
import axios from 'axios';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';

export const createLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/payment-links`,
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

export const listLinks = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/payment-links`,
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

export const getLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/payment-links/${req.params.id}`,
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

export const checkoutLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/payment-links/${req.params.id}/checkout`,
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

/**
 * checkTariff — Cek ongkos kirim 3PL (JNE/J&T) sebelum buat payment link.
 * Proxy ke order-service /api/v1/payment-links/tariff yang kemudian ke integration-gateway.
 * Query params: provider, origin_code, destination_code, weight_kg
 */
export const checkTariff = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/logistics/tariff`,
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
