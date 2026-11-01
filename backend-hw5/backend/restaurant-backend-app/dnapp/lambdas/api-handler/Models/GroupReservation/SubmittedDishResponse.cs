using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public record SubmittedDishResponse(
    [property: JsonPropertyName("dishId")] string DishId,
    [property: JsonPropertyName("quantity")] int Quantity);
