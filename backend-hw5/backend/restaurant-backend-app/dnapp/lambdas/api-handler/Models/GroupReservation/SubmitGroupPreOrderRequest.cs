using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public class SubmitGroupPreOrderRequest
{
    [JsonPropertyName("reservationId")]
    public string ReservationId { get; set; } = string.Empty;
}
