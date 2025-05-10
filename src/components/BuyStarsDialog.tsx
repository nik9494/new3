import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { telegramPaymentService } from '@/services/telegramPaymentService';
import { useApiRequest } from '@/hooks/useApiRequest';
import ErrorMessage from '@/components/ui/error-message';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { CheckCircle } from 'lucide-react';

interface BuyStarsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (amount: number) => void;
}

const BuyStarsDialog: React.FC<BuyStarsDialogProps> = ({
  open,
  onOpenChange,
  onSuccess = () => {},
}) => {
  const [amount, setAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>('100');
  const [useCustomAmount, setUseCustomAmount] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const {
    isLoading,
    error,
    execute: buyStars,
  } = useApiRequest(telegramPaymentService.buyStars);

  const handleAmountChange = (values: number[]) => {
    setAmount(values[0]);
    setCustomAmount(values[0].toString());
    setUseCustomAmount(false);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomAmount(value);
    setUseCustomAmount(true);

    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 10 && numValue <= 10000) {
      setAmount(numValue);
    }
  };

  const handleBuyStars = async () => {
    try {
      const finalAmount = useCustomAmount ? parseInt(customAmount, 10) : amount;

      if (isNaN(finalAmount) || finalAmount < 10) {
        throw new Error('Минимальная сумма покупки 10 Stars');
      }

      if (finalAmount > 10000) {
        throw new Error('Максимальная сумма покупки 10000 Stars');
      }

      const result = await buyStars(finalAmount);

      if (result.success) {
        setSuccessMessage(`Вы успешно приобрели ${finalAmount} Stars!`);
        setTimeout(() => {
          onSuccess(finalAmount);
          onOpenChange(false);
          setSuccessMessage('');
        }, 2000);
      }
    } catch (error) {
      console.error('Error buying stars:', error);
    }
  };

  const isPaymentAvailable = telegramPaymentService.isPaymentAvailable();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Купить Stars</DialogTitle>
          <DialogDescription>
            Пополните баланс Stars для участия в играх и получения бонусов
          </DialogDescription>
        </DialogHeader>

        {!isPaymentAvailable ? (
          <div className="py-6">
            <ErrorMessage
              title="Платежи недоступны"
              error="Платежи доступны только в Telegram Mini App"
            />
          </div>
        ) : successMessage ? (
          <div className="py-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-lg font-medium">{successMessage}</p>
          </div>
        ) : (
          <div className="py-4 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="amount">Количество Stars</Label>
                <span className="font-medium">{amount} ⭐</span>
              </div>
              <Slider
                id="amount"
                min={10}
                max={1000}
                step={10}
                value={[amount]}
                onValueChange={handleAmountChange}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-amount">Своя сумма</Label>
              <Input
                id="custom-amount"
                type="number"
                min={10}
                max={10000}
                value={customAmount}
                onChange={handleCustomAmountChange}
                disabled={isLoading}
              />
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm">Стоимость: {amount} ₽</p>
              <p className="text-xs text-muted-foreground mt-1">1 Star = 1 ₽</p>
            </div>

            {error && <ErrorMessage error={error} />}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Отмена
          </Button>
          <Button
            onClick={handleBuyStars}
            disabled={isLoading || !isPaymentAvailable || !!successMessage}
          >
            {isLoading ? <LoadingSpinner size={4} className="mr-2" /> : null}
            {isLoading ? 'Обработка...' : 'Купить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BuyStarsDialog;
