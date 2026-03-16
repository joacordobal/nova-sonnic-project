import { Tool } from "./toolBase";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { ToolRunner } from "./toolRunner";

export class ConnectCallTool implements Tool {
  public name = "escalateToAgent";
  public description = 
	"Escala la conversación a un agente humano cuando el cliente lo solicite o cuando la situación lo requiera. " +
	"IMPORTANTE: SIEMPRE debes preguntar al usuario su número de teléfono, incluso si ya lo conoces. " +
	"NO uses números de conversaciones anteriores. " +
	"Pregunta explícitamente: '¿Cuál es tu número de teléfono para que te contactemos?' " +
	"Usa esta herramienta cuando el usuario: " +
	"- Pida hablar con una persona real o un agente " +
	"- Diga 'quiero hablar con alguien', 'necesito un agente', 'comunícame con soporte' " +
	"- Exprese frustración o insatisfacción con el servicio automatizado " +
	"- Tenga un problema complejo que requiera intervención humana " +
	"- Solicite explícitamente ser transferido o escalado";

  private lambdaClient: LambdaClient;
  private lambdaFunctionName: string;

  constructor() {
    this.lambdaClient = new LambdaClient({ 
      region: process.env.AWS_REGION || "us-east-1" 
    });
    this.lambdaFunctionName = process.env.CONNECT_LAMBDA_FUNCTION || "outboundcall-Nova";
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
              "customerPhone": {
                "type": "string",
                "description": "Número de teléfono del cliente para el callback"
              },
              "customerName": {
                "type": "string",
                "description": "Nombre del cliente"
              },
              "reason": {
                "type": "string",
                "description": "Motivo del escalamiento (ej: problema técnico, queja, consulta compleja)"
              },
              "priority": {
                "type": "string",
                "enum": ["low", "medium", "high", "urgent"],
                "description": "Prioridad del callback",
                "default": "medium"
              }
            },
            "required": ["customerPhone"]
          })
        }
      }
    };
  }

  async run(params: any): Promise<any> {
    try {
      console.log(`[ConnectCallTool] Escalamiento recibido:`, params);
      
      const callbackParams = typeof params === 'string' ? JSON.parse(params) : params;
      
      if (!callbackParams.customerPhone) {
        return {
          success: false,
          error: "Se necesita el número de teléfono del cliente para programar el callback"
        };
      }

      console.log(`[ConnectCallTool] Solicitando callback para:`, callbackParams);

      const command = new InvokeCommand({
        FunctionName: this.lambdaFunctionName,
		Payload: JSON.stringify({
          phoneNumber: callbackParams.customerPhone,
          customerName: callbackParams.customerName || "Cliente",
          reason: callbackParams.reason || "Solicitud de asistencia",
        })
      });

      const response = await this.lambdaClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      console.log(`[ConnectCallTool] Respuesta Lambda:`, result);
      
      if (result.success) {
        return {
          success: true,
          message: `Callback programado exitosamente. Un agente te contactará pronto.`,
          callbackId: result.contactId || result.callbackId,
          estimatedWaitTime: result.estimatedWaitTime || "5-10 minutos"
        };
      } else {
        return {
          success: false,
          error: result.error || "Error al programar el callback"
        };
      }
    } catch (error) {
      console.error("[ConnectCallTool] Error:", error);
      return {
        success: false,
        error: `Error al procesar la solicitud: ${(error as Error).message}`
      };
    }
  }
}

(() => ToolRunner.getToolRunner().registerTool(new ConnectCallTool()))();