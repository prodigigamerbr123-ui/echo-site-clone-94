
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

interface AIActionConfirmationProps {
  action: {
    type: string;
    description: string;
    params: any;
  };
  onConfirm: () => void;
  onReject: () => void;
}

export function AIActionConfirmation({ action, onConfirm, onReject }: AIActionConfirmationProps) {
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5" />
          Autorização Necessária
        </CardTitle>
        <CardDescription className="text-orange-700">
          A IA quer executar uma ação que requer sua aprovação:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-white rounded-lg border">
          <p className="font-medium text-gray-900">{action.description}</p>
          {action.params && (
            <pre className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
              {JSON.stringify(action.params, null, 2)}
            </pre>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={onConfirm}
            className="flex items-center gap-2"
            size="sm"
          >
            <CheckCircle className="h-4 w-4" />
            Autorizar
          </Button>
          <Button 
            onClick={onReject}
            variant="outline"
            className="flex items-center gap-2"
            size="sm"
          >
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
