import { NextApiRequest, NextApiResponse } from 'next';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txHash, outputIndex } = req.query;
  
  if (!txHash) {
    return res.status(400).json({ error: 'Transaction hash is required' });
  }

  // Get the Blockfrost API key from environment variables
  const apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Blockfrost API key not configured' });
  }

  try {
    // Initialize Blockfrost client with pre-prod network
    const API = new BlockFrostAPI({
      projectId: apiKey,
      network: 'preprod',
    });

    // Fetch all data needed for transaction referencing
    const [txUtxos, txMetadata, tx] = await Promise.all([
      API.txsUtxos(txHash as string),
      API.txsMetadata(txHash as string),
      API.txs(txHash as string)
    ]);

    // Return the combined response with all the data needed for transaction referencing
    return res.status(200).json({
      utxos: txUtxos,
      metadata: txMetadata,
      transaction: tx
    });
  } catch (error) {
    console.error('Error fetching from Blockfrost:', error);
    return res.status(500).json({ error: 'Failed to fetch from Blockfrost', details: error });
  }
} 