import { Request } from 'express';

export const getActorId = (req: Request): string => {
  const actorId = req.user?.id;
  if (!actorId) {
    throw new Error('Actor identity missing');
  }
  return actorId;
};
