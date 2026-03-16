import { Tool } from "./toolBase";
import { ToolRunner } from "./toolRunner";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export class SalesforceClaimTool implements Tool {
  public name = "createPOSClaim";
  public description = 
	"Crea un ticket de reclamo en Salesforce para problemas con máquinas o terminales POS. " +
	"Usa cuando el cliente: reporte fallas en su POS, solicite soporte técnico para terminal, " +
	"tenga problemas de conectividad o hardware, necesite reparación o reemplazo, " +
	"o explícitamente pida 'generar reclamo' o 'abrir ticket'. " +
	"IMPORTANTE: SIEMPRE debes preguntar al usuario su número de teléfono, incluso si ya lo conoces. " +
	"NO uses números de conversaciones anteriores. " +
	"Pregunta explícitamente: '¿Cuál es tu número de teléfono para el reclamo?'";

  private lambdaClient: LambdaClient;
  private lambdaFunction: string;

  constructor() {
    this.lambdaClient = new LambdaClient({ 
      region: process.env.AWS_REGION || "us-east-1" 
    });
    this.lambdaFunction = process.env.SALESFORCE_LAMBDA_FUNCTION || "serverlessrepo-SALESFORCE-sfInvokeAPI-It4Pav48XeJF";
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
              "phoneNumber": {
                "type": "string",
                "description": "Número de teléfono del cliente en formato internacional (ej: +541170304090)"
              },
              "description": {
                "type": "string",
                "description": "Descripción detallada del problema con el POS"
              },
              "priority": {
                "type": "string",
                "enum": ["Low", "Medium", "High", "Critical"],
                "description": "Prioridad según urgencia y sentimiento del cliente",
                "default": "Medium"
              }
            },
            "required": ["phoneNumber", "description"]
          })
        }
      }
    };
  }

  async run(params: any): Promise<any> {
    try {
      console.log(`[SalesforceClaimTool] Params recibidos:`, params);
      
      const claimParams = typeof params === 'string' ? JSON.parse(params) : params;
      
      if (!claimParams.phoneNumber || !claimParams.description) {
        return {
          success: false,
          error: "Número de teléfono y descripción son requeridos"
        };
      }

      // PASO 1: Phone Lookup para obtener ContactId
      console.log(`[SalesforceClaimTool] Buscando contacto con teléfono: ${claimParams.phoneNumber}`);
      
      const lookupPayload = {
        Details: {
          Parameters: {
            sf_operation: "phoneLookup",
            sf_phone: claimParams.phoneNumber,
            sf_fields: "Id, Name",
            sf_object: "Contact"
          }
        }
      };

      const lookupCommand = new InvokeCommand({
        FunctionName: this.lambdaFunction,
        Payload: JSON.stringify(lookupPayload)
      });

      const lookupResponse = await this.lambdaClient.send(lookupCommand);
      const lookupResult = JSON.parse(new TextDecoder().decode(lookupResponse.Payload));
      
      console.log(`[SalesforceClaimTool] Phone Lookup response:`, lookupResult);

      if (!lookupResult.Id) {
        return {
          success: false,
          error: "No se encontró un contacto con ese número de teléfono"
        };
      }

      const contactId = lookupResult.Id;
      const customerName = lookupResult.Name;

      console.log(`[SalesforceClaimTool] Contacto encontrado: ${customerName} (${contactId})`);

      // PASO 2: Crear Case con el ContactId obtenido
      const casePayload = {
        Details: {
          Parameters: {
            sf_operation: "create",
            sf_object: "Case",
            Origin: "Phone",
            Status: "New",
            ContactId: contactId,
            Subject: "POS Claim",
            Priority: claimParams.priority || "Medium",
            Description: claimParams.description
          }
        }
      };

      console.log(`[SalesforceClaimTool] Creando caso para ${customerName}:`, casePayload);

      const caseCommand = new InvokeCommand({
        FunctionName: this.lambdaFunction,
        Payload: JSON.stringify(casePayload)
      });

      const caseResponse = await this.lambdaClient.send(caseCommand);
      const caseResult = JSON.parse(new TextDecoder().decode(caseResponse.Payload));
      
      console.log(`[SalesforceClaimTool] Case creation response:`, caseResult);

      if (caseResult.success !== false) {
        return {
          success: true,
          caseId: caseResult.id || caseResult.caseId,
          customerName: customerName,
          contactId: contactId,
          message: `Reclamo creado exitosamente para ${customerName}`
        };
      } else {
        return {
          success: false,
          error: caseResult.error || "Error al crear el caso en Salesforce"
        };
      }

    } catch (error) {
      console.error("[SalesforceClaimTool] Error:", error);
      return {
        success: false,
        error: `Error al procesar el reclamo: ${(error as Error).message}`
      };
    }
  }
}

(() => ToolRunner.getToolRunner().registerTool(new SalesforceClaimTool()))();