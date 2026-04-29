import express from 'express';
import { routes } from './routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

app.use(routes);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Admin Service listening on port ${port}`);
});
