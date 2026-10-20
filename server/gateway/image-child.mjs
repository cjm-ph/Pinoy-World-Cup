import { normalizeImage } from './image-core.mjs';
process.once('message', async input => {
  try { process.send(await normalizeImage(input,stage=>process.send({progress:stage})), () => process.exit(0)); }
  catch { process.send({error:'image rejected'}, () => process.exit(1)); }
});
