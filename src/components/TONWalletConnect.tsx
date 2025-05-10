import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Wallet } from 'lucide-react';
import tonConnectService from '@/services/tonConnectService';

interface TONWalletConnectProps {
  onSuccess?: (address: string) => void;
  onCancel?: () => void;
}

const TONWalletConnect: React.FC<TONWalletConnectProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Check if wallet is already connected on component mount
  useEffect(() => {
    const checkWalletConnection = () => {
      try {
        const isWalletConnected = tonConnectService.isWalletConnected();
        if (isWalletConnected) {
          const wallet = tonConnectService.getConnectedWallet();
          if (wallet) {
            setWalletAddress(wallet.address);
            setIsConnected(true);
            if (onSuccess) onSuccess(wallet.address);
          }
        }
      } catch (err) {
        console.error('Error checking wallet connection:', err);
      }
    };

    checkWalletConnection();
  }, [onSuccess]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const wallet = await tonConnectService.connectWallet();
      setWalletAddress(wallet.address);
      setIsConnected(true);
      if (onSuccess) onSuccess(wallet.address);
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await tonConnectService.disconnectWallet();
      setWalletAddress(null);
      setIsConnected(false);
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
      setError('Failed to disconnect wallet. Please try again.');
    }
  };

  const formatWalletAddress = (address: string): string => {
    if (address.length <= 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" /> TON Wallet Connection
        </CardTitle>
        <CardDescription>
          Connect your TON wallet to withdraw Stars to TON cryptocurrency
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isConnected && walletAddress ? (
          <div className="space-y-4">
            <Alert variant="default" className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle>Wallet Connected</AlertTitle>
              <AlertDescription>
                Your TON wallet is successfully connected.
              </AlertDescription>
            </Alert>

            <div className="p-3 bg-muted rounded-md break-all">
              <p className="text-sm font-medium">Wallet Address:</p>
              <p className="font-mono">{walletAddress}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Wallet className="h-16 w-16 mx-auto mb-4 text-primary opacity-80" />
            <p className="mb-6">
              Connect your TON wallet to withdraw your Stars as TON
              cryptocurrency.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {isConnected ? (
          <>
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect Wallet
            </Button>
            <Button onClick={onCancel}>Done</Button>
          </>
        ) : (
          <>
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="ml-auto"
            >
              {isConnecting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isConnecting ? 'Connecting...' : 'Connect TON Wallet'}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default TONWalletConnect;
