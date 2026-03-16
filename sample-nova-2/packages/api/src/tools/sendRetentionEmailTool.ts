import { Tool } from "./toolBase";
import { ToolRunner } from "./toolRunner";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export class SendRetentionEmailTool implements Tool {
  public name = "sendRetentionConfirmation";
  public description = 
	"Envía email de confirmación con los términos negociados. " +
	"USA SOLO cuando: 1) Cliente aceptó la oferta, 2) Cliente proporcionó su email, " +
	"3) Cliente CONFIRMÓ que el email es correcto después de repetírselo. " +
	"NUNCA envíes sin que el cliente confirme explícitamente: 'sí es correcto', 'exacto', 'correcto'. " +
	"Proceso obligatorio: Preguntar email → Repetir para confirmar → Esperar confirmación → Ejecutar tool.";

  private lambdaClient: LambdaClient;
  private lambdaFunction: string;

  constructor() {
    this.lambdaClient = new LambdaClient({ 
      region: process.env.AWS_REGION || "us-east-1" 
    });
    this.lambdaFunction = process.env.RETENTION_LAMBDA_FUNCTION || "SendRetentionEmail";
  }

  spec() {
    return {
      toolSpec: {
        name: this.name,
        description: this.description,
        inputSchema: {
          json: JSON.stringify({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "customerEmail": {
                "type": "string",
                "description": "Email del cliente para enviar la confirmación"
              },
              "customerName": {
                "type": "string",
                "description": "Nombre completo del cliente"
              },
              "planName": {
                "type": "string",
                "description": "Nombre del plan o beneficio negociado (ej: '70% descuento en comisiones')"
              },
              "activationDate": {
                "type": "string",
                "description": "Fecha de inicio del beneficio (formato DD/MM/YYYY)"
              },
              "expirationDate": {
                "type": "string",
                "description": "Fecha de vencimiento o duración (ej: '20/12/2025' o '6 meses')"
              },
              "benefitDescription": {
                "type": "string",
                "description": "Descripción detallada del beneficio acordado"
              }
            },
            "required": ["customerEmail", "planName", "benefitDescription"]
          })
        }
      }
    };
  }

  async run(params: any): Promise<any> {
    try {
      console.log(`[SendRetentionEmailTool] Params:`, params);
      
      const emailParams = typeof params === 'string' ? JSON.parse(params) : params;
      
      // Validación email
      if (!emailParams.customerEmail || !emailParams.customerEmail.includes('@')) {
        return {
          success: false,
          error: "Email válido es requerido"
        };
      }

      // Valores por defecto
      const today = new Date();
      const defaultActivation = today.toLocaleDateString('es-AR');
      const futureDate = new Date(today.setMonth(today.getMonth() + 6));
      const defaultExpiration = futureDate.toLocaleDateString('es-AR');

      const payload = {
        customerEmail: emailParams.customerEmail,
        customerName: emailParams.customerName || "Cliente",
        planName: emailParams.planName,
        activationDate: emailParams.activationDate || defaultActivation,
        expirationDate: emailParams.expirationDate || defaultExpiration,
        benefitDescription: emailParams.benefitDescription
      };

      console.log(`[SendRetentionEmailTool] Invoking Lambda:`, payload);

      const command = new InvokeCommand({
        FunctionName: this.lambdaFunction,
        Payload: JSON.stringify(payload)
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      
      console.log(`[SendRetentionEmailTool] Response:`, result);

      if (result.success) {
        return {
          success: true,
          messageId: result.messageId,
          customerEmail: emailParams.customerEmail,
          message: `Email de confirmación enviado a ${emailParams.customerEmail}`
        };
      } else {
        return {
          success: false,
          error: result.error || "Error al enviar el email"
        };
      }

    } catch (error) {
      console.error("[SendRetentionEmailTool] Error:", error);
      return {
        success: false,
        error: `Error: ${(error as Error).message}`
      };
    }
  }
}

(() => ToolRunner.getToolRunner().registerTool(new SendRetentionEmailTool()))();