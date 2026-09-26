import { z, type ZodType } from 'zod';
import type { Channel, Requests } from '../../shared/contracts';

/** Argument schemas for every renderer → main channel. They run in main only (SR-11). */
export const requestSchemas: { [C in Channel]: ZodType<Requests[C]> } = {
  'app.info': z.tuple([]),
};
