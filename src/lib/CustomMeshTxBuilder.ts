import { MeshTxBuilder, PlutusScript, TxComplete } from "@meshsdk/core";

// Define a more complete PlutusScript interface to match MeshJS API
interface EnhancedPlutusScript extends PlutusScript {
  mintRedeemerValue: (redeemer: any, format?: string) => EnhancedPlutusScript;
}

// CustomMeshTxBuilder extends MeshTxBuilder to use our local API endpoint
export class CustomMeshTxBuilder extends MeshTxBuilder {
  // Store reference to the original transaction
  private refTxHash: string | null = null;
  private refOutputIndex: number | null = null;
  private dataFetched: boolean = false;

  // Override the mintTxInReference method to use our local API
  mintTxInReference(txHash: string, outputIndex: number): EnhancedPlutusScript {
    // Store the reference details for later use
    this.refTxHash = txHash;
    this.refOutputIndex = outputIndex;
    
    // Fetch the transaction data immediately to ensure it's available
    this.fetchTransactionData();
    
    // Call the parent method and cast to our enhanced interface
    return super.mintTxInReference(txHash, outputIndex) as EnhancedPlutusScript;
  }

  // Method to fetch transaction data from our local API
  private async fetchTransactionData(): Promise<void> {
    if (!this.refTxHash || this.dataFetched) {
      return;
    }

    try {
      console.log(`Fetching reference tx data for ${this.refTxHash}`);
      // Fetch the transaction data from our local API
      const response = await fetch(`/api/blockfrost/reference-tx?txHash=${this.refTxHash}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error fetching transaction data: ${response.status} ${errorText}`);
      }
      
      // Mark data as fetched so we don't fetch it again
      this.dataFetched = true;
      console.log('Successfully fetched reference tx data');
    } catch (error) {
      console.error('Error fetching transaction data:', error);
      // We don't throw here, we'll let the complete method attempt again if needed
    }
  }

  // Override the complete method to ensure our transaction is properly built
  async complete(): Promise<TxComplete> {
    try {
      // If we have a reference transaction and haven't fetched it yet, fetch it now
      if (this.refTxHash && !this.dataFetched) {
        await this.fetchTransactionData();
        
        // Small delay to ensure data is processed
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Call the parent complete method
      return super.complete();
    } catch (error) {
      console.error('Error completing transaction:', error);
      throw error;
    }
  }
} 