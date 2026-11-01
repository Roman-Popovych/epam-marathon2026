using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GroupReservation;
using APIHandler.Services.GroupReservations;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GroupReservations;

public class SubmitGroupPreOrderHandler(IGroupReservationService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(APIGatewayProxyRequest request, ILambdaContext context)
    {
        if (!request.TryGetPathValue("groupReservationId", out string? groupReservationId))
        {
            return ResponseBuilder.CreateErrorResponse(400, "Missing 'groupReservationId' in path parameters.", context.Logger);
        }

        if (!TryDeserializeRequest(request, out SubmitGroupPreOrderRequest? body) ||
            string.IsNullOrWhiteSpace(body!.ReservationId))
        {
            return ResponseBuilder.CreateErrorResponse(400, "Invalid request body: 'reservationId' is required.", context.Logger);
        }

        if (request.RequestContext?.Authorizer?.Claims == null ||
            !request.RequestContext.Authorizer.Claims.TryGetValue("sub", out string? userId))
        {
            return ResponseBuilder.CreateErrorResponse(401, "Unauthorized.", context.Logger);
        }

        try
        {
            IReadOnlyList<SubmittedDishResponse> result =
                await service.SubmitGroupPreOrderAsync(userId, groupReservationId, body.ReservationId);

            return ResponseBuilder.CreateJsonResponse(200, result);
        }
        catch (GroupReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (ReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (ActionForbiddenException ex)
        {
            return ResponseBuilder.CreateErrorResponse(403, ex.Message, context.Logger);
        }
        catch (ValidationException ex)
        {
            return ResponseBuilder.CreateErrorCodeResponse(ex);
        }
    }

    private static bool TryDeserializeRequest(APIGatewayProxyRequest request, out SubmitGroupPreOrderRequest? body)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            body = JsonSerializer.Deserialize<SubmitGroupPreOrderRequest>(request.Body ?? string.Empty, options);
            return body != null;
        }
        catch (JsonException)
        {
            body = null;
            return false;
        }
    }
}
