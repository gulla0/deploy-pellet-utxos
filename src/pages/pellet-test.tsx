import Head from "next/head";
import { CardanoWallet, useWallet } from "@meshsdk/react";
import { useState, useEffect } from "react";
import { BlockfrostProvider, Asset, stringToHex, deserializeAddress, mConStr0 } from "@meshsdk/core";
import { MeshTxBuilder } from "@meshsdk/core";

// Configuration values
const VALIDATOR_ADDRESS = 'addr_test1wrw5ncshtpkh5phqwdxm3va7ejljlgc3n09a4sv7c4mpnxcg8rfkt';
const POLICY_ID = 'dd49e217586d7a06e0734db8b3beccbf2fa3119bcbdac19ec576199b';
const ADMIN_TOKEN_POLICY = 'dd3314723ac41eb2d91e4b695869ff5597f0f0acea9f063d4adb60d5';
const ADMIN_TOKEN_NAME = '617374657269612d61646d696e';
const SHIPYARD_POLICY = 'a6c2c9684eab662549c6417aea6724b238591e38cdddaabd43086ef3';
const PELLET_REF_TX_HASH = 'd2aad1327c66dc18ef0e31755195dce708dd13ceb22ff5e7350662512cee983f';
const PELLET_REF_OUTPUT_INDEX = 0;

// Load Blockfrost API key from environment
const BLOCKFROST_API_KEY = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || '';

export default function PelletTest() {
  const { connected, wallet } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [pellet, setPellet] = useState({
    fuel: "55",
    pos_x: "11",
    pos_y: "0",
    shipyard_policy: SHIPYARD_POLICY
  });
  const [extractedScriptHash, setExtractedScriptHash] = useState("");
  
  // Update wallet address when connected
  useEffect(() => {
    if (connected) {
      updateWalletInfo();
    }
  }, [connected]);
  
  // Extract script hash when component loads
  useEffect(() => {
    try {
      const hash = extractScriptHash(VALIDATOR_ADDRESS);
      setExtractedScriptHash(hash);
      addLog(`Script hash extracted: ${hash}`);
    } catch (error) {
      addLog(`Error extracting script hash: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);
  
  // Update wallet info
  const updateWalletInfo = async () => {
    if (connected) {
      try {
        const [address] = await wallet.getUsedAddresses();
        setWalletAddress(address);
        addLog(`Wallet connected: ${address}`);
      } catch (error) {
        addLog(`Error getting wallet address: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  
  // Helper to add log messages
  const addLog = (message: string) => {
    setLogMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };
  
  // Extract script hash from validator address
  function extractScriptHash(validatorAddress: string): string {
    try {
      const deserializedAddress = deserializeAddress(validatorAddress);
      
      if (deserializedAddress.scriptHash) {
        return deserializedAddress.scriptHash;
      } else {
        addLog("No script hash found in deserialized address, falling back to original method");
        return validatorAddress.slice(0, 56);
      }
    } catch (error) {
      throw new Error(`Failed to extract script hash: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Handle pellet form field changes
  const handlePelletChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPellet(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Deploy pellet
  const deployPellet = async () => {
    if (!connected) {
      addLog("Please connect your wallet first");
      return;
    }
    
    setIsDeploying(true);
    addLog("Starting pellet deployment test");
    
    try {
      // Create the transaction builder
      const tx = new MeshTxBuilder({
        fetcher: new BlockfrostProvider(BLOCKFROST_API_KEY),
        verbose: true,
      });
      
      // Set the network to preprod
      tx.setNetwork("preprod");
      addLog("Network configured for preprod");
      
      // Extract script hash from validator address
      const validatorScriptHash = extractedScriptHash;
      addLog(`Using script hash: ${validatorScriptHash}`);
      
      // Admin token unit - using concatenated format without dot
      const adminTokenUnit = `${ADMIN_TOKEN_POLICY}${ADMIN_TOKEN_NAME}`;
      addLog(`Using admin token unit: ${adminTokenUnit}`);
      
      // Prepare the datum for this pellet
      const pelletDatum = {
        constructor: 0,
        fields: [
          pellet.pos_x,
          pellet.pos_y,
          pellet.shipyard_policy
        ]
      };
      addLog(`Pellet datum: ${JSON.stringify(pelletDatum, null, 2)}`);
      
      // Create base assets for this pellet
      const assets: Asset[] = [
        { unit: "lovelace", quantity: "1000000" },
        { unit: adminTokenUnit, quantity: "1" }
      ];
      
      // Mint fuel tokens using the validator script as the minting policy
      const fuelTokenHex = stringToHex("FUEL");
      addLog(`Minting ${pellet.fuel} FUEL tokens with policy ${validatorScriptHash}`);
      
      // Simplified minting approach for PlutusScriptV3
      tx.mintPlutusScriptV3()
        .mint(pellet.fuel, validatorScriptHash, fuelTokenHex) 
        .mintTxInReference(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX)
        .mintRedeemerValue(mConStr0(['FUEL']));
      
      addLog("Minting with reference script configured");
      
      // Add the minted fuel token to assets
      const tokenFullName = `${validatorScriptHash}${fuelTokenHex}`;
      addLog(`Token full name: ${tokenFullName}`);
      assets.push({
        unit: tokenFullName,
        quantity: pellet.fuel
      });
      
      // Send assets to the validator address with inline datum
      tx.txOut(VALIDATOR_ADDRESS, assets)
        .txOutInlineDatumValue(pelletDatum);
      
      addLog("Output added to transaction");
      
      // Set change address
      const changeAddress = await wallet.getChangeAddress();
      tx.changeAddress(changeAddress);
      addLog(`Change address set to: ${changeAddress}`);
      
      // Get UTXOs for inputs
      const utxos = await wallet.getUtxos();
      addLog(`Got ${utxos.length} UTXOs from wallet`);
      
      if (utxos.length === 0) {
        throw new Error("No UTXOs found in wallet");
      }
      
      // Select UTXOs
      tx.selectUtxosFrom(utxos);
      
      // Add collateral
      const collateralUtxos = await wallet.getCollateral();
      if (collateralUtxos && collateralUtxos.length > 0) {
        const collateral = collateralUtxos[0];
        addLog("Using designated collateral UTXO");
        tx.txInCollateral(
          collateral.input.txHash,
          collateral.input.outputIndex,
          collateral.output.amount,
          collateral.output.address
        );
      } else {
        // Find a UTXO with enough ADA to use as collateral
        const potentialCollateral = utxos.find(utxo => {
          const lovelaceAmount = utxo.output.amount.find(a => a.unit === 'lovelace');
          return lovelaceAmount && BigInt(lovelaceAmount.quantity) >= BigInt(5000000); // 5 ADA
        });
        
        if (potentialCollateral) {
          addLog("Using regular UTXO as collateral");
          tx.txInCollateral(
            potentialCollateral.input.txHash,
            potentialCollateral.input.outputIndex,
            potentialCollateral.output.amount,
            potentialCollateral.output.address
          );
        } else {
          throw new Error("No suitable collateral found. Please ensure your wallet has at least 5 ADA in a single UTXO.");
        }
      }
      
      // Complete the transaction
      addLog("Completing transaction...");
      
      try {
        // Log debugging information about the redeemer
        const redeemer = mConStr0(['FUEL']);
        addLog(`Redeemer structure: ${JSON.stringify(redeemer)}`);
        
        // Create transaction
        const unsignedTx = await tx.complete();
        addLog("Transaction completed successfully");
        
        // Sign the transaction
        addLog("Signing transaction...");
        const signedTx = await wallet.signTx(unsignedTx, true);
        addLog("Transaction signed successfully");
        
        // Submit the transaction
        addLog("Submitting transaction...");
        const hash = await wallet.submitTx(signedTx);
        addLog(`Transaction submitted with hash: ${hash}`);
        setTxHash(hash);
      } catch (completionError) {
        // Enhanced error logging
        addLog(`Transaction completion error: ${completionError instanceof Error ? completionError.message : String(completionError)}`);
        
        if (completionError instanceof Error && completionError.stack) {
          const stackLines = completionError.stack.split('\n').slice(0, 3).join('\n');
          addLog(`Stack trace: ${stackLines}`);
        }
        
        throw completionError;  // Re-throw to be caught by the outer catch
      }
      
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Test failed:", error);
    } finally {
      setIsDeploying(false);
    }
  };
  
  return (
    <div className="bg-gray-900 w-full text-white min-h-screen">
      <Head>
        <title>Pellet Deployment Tester</title>
        <meta
          name="description"
          content="Test deploying a single pellet UTXO to your Cardano validator"
        />
      </Head>

      <div className="container mx-auto py-8 px-4">
        <h1 className="text-4xl font-thin mb-10 text-center">
          Pellet Deployment Tester
        </h1>

        {/* Wallet Connection */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Wallet Connection
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              {connected ? (
                <div>
                  <p className="text-green-400 mb-2">Wallet Connected</p>
                  <p className="text-sm text-gray-300 break-all">
                    Address: {walletAddress}
                  </p>
                </div>
              ) : (
                <p className="text-yellow-400">Please connect your wallet</p>
              )}
            </div>
            <CardanoWallet />
          </div>
        </div>

        {/* Pellet Configuration */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Pellet Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Fuel Amount
              </label>
              <input
                type="text"
                name="fuel"
                value={pellet.fuel}
                onChange={handlePelletChange}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Position X
              </label>
              <input
                type="text"
                name="pos_x"
                value={pellet.pos_x}
                onChange={handlePelletChange}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Position Y
              </label>
              <input
                type="text"
                name="pos_y"
                value={pellet.pos_y}
                onChange={handlePelletChange}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Shipyard Policy
              </label>
              <input
                type="text"
                name="shipyard_policy"
                value={pellet.shipyard_policy}
                onChange={handlePelletChange}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        {/* Validator Info */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Validator Information
          </h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Validator Address
            </label>
            <div className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white overflow-auto">
              <code className="break-all">{VALIDATOR_ADDRESS}</code>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Extracted Script Hash
            </label>
            <div className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white overflow-auto">
              <code className="break-all">{extractedScriptHash}</code>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <div className="flex justify-center">
            <button
              onClick={deployPellet}
              disabled={isDeploying || !connected}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
            >
              {isDeploying ? "Deploying..." : "Deploy Test Pellet"}
            </button>
          </div>
          
          {txHash && (
            <div className="mt-4 p-4 bg-green-800 rounded-lg">
              <p className="font-medium text-white mb-2">Transaction Submitted:</p>
              <a
                href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:underline break-all"
              >
                {txHash}
              </a>
            </div>
          )}
        </div>

        {/* Log Output */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Log Output
          </h2>
          <div className="bg-black p-4 rounded-lg h-64 overflow-auto font-mono text-xs">
            {logMessages.map((message, index) => (
              <div key={index} className="mb-1">
                {message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 