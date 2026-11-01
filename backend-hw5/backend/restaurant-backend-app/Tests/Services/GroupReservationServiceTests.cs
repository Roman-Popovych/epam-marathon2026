using APIHandler.Constants;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Models.GroupReservation;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.Auth;
using APIHandler.Services.GroupReservations;
using APIHandler.Services.Locations;
using AutoFixture.Xunit2;
using Moq;

namespace APIHandler.Tests.Services;

public class GroupReservationServiceTests
{
    private readonly Mock<IGroupReservationRepository> _groupReservationRepositoryMock = new();
    private readonly Mock<ITableRepository> _tableRepositoryMock = new();
    private readonly Mock<IReservationRepository> _reservationRepositoryMock = new();
    private readonly Mock<IGuestSessionRepository> _guestSessionRepositoryMock = new();
    private readonly Mock<IUserService> _userServiceMock = new();
    private readonly Mock<ILocationService> _locationServiceMock = new();
    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();

    private readonly GroupReservationService _service;

    public GroupReservationServiceTests()
    {
        _service = new GroupReservationService(
            _groupReservationRepositoryMock.Object,
            _tableRepositoryMock.Object,
            _reservationRepositoryMock.Object,
            _guestSessionRepositoryMock.Object,
            _userServiceMock.Object,
            _locationServiceMock.Object,
            _orderRepositoryMock.Object);
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationByTokenAsync_ValidInput_ReturnsGroupReservationInfo(
        GroupReservation groupReservation,
        Table table,
        Reservation reservation,
        Location location,
        string expectedUserName)
    {
        groupReservation.ReservationId = reservation.Id;
        groupReservation.Status = GroupReservationStatus.Open;
        reservation.TableId = table.Id;
        table.LocationId = location.Id;

        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByTokenAsync(groupReservation.ReservationToken))
            .ReturnsAsync(groupReservation);

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _guestSessionRepositoryMock
            .Setup(r => r.CountByGroupReservationId(groupReservation.GroupReservationId))
            .ReturnsAsync(0);

        _tableRepositoryMock
            .Setup(r => r.GetTableAsync(table.Id))
            .ReturnsAsync(table);

        _locationServiceMock
            .Setup(s => s.GetLocationByIdAsync(table.LocationId))
            .ReturnsAsync(location);

        _userServiceMock
            .Setup(s => s.GetUserName(reservation.CustomerId!))
            .ReturnsAsync(expectedUserName);

        var result = await _service.GetGroupReservationByTokenAsync(groupReservation.ReservationToken);

        Assert.Equal(groupReservation.GroupReservationId, result.GroupReservationId);
        Assert.Equal(table.LocationId, result.LocationId);
        Assert.Equal(reservation.GuestCount, result.MaxGuestCount);
        Assert.Equal(reservation.StartTime, result.StartTime);
        Assert.Equal(reservation.EndTime, result.EndTime);
        Assert.Equal(table.TableNumber, result.TableNumber);
        Assert.Equal("Green & Tasty", result.RestaurantName);
        Assert.Equal(location.Address, result.LocationAddress);
        Assert.Equal(expectedUserName, result.InviterName);
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationByTokenAsync_InvalidToken_ThrowsNotFound(string token)
    {
        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByTokenAsync(token))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(() => _service.GetGroupReservationByTokenAsync(token));
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Closed)]
    [InlineAutoData(GroupReservationStatus.Submitted)]
    public async Task GetGroupReservationByTokenAsync_GroupReservationIsNotOpen_ThrowsException(
        GroupReservationStatus status,
        GroupReservation groupReservation)
    {
        groupReservation.Status = status;

        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByTokenAsync(groupReservation.ReservationToken))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync<GroupReservationExpiredException>(() => _service.GetGroupReservationByTokenAsync(groupReservation.ReservationToken));
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationByTokenAsync_WhenGuestCountIsMax_ThrowsGuestLimitExceeded(GroupReservation groupReservation, Reservation reservation)
    {
        groupReservation.Status = GroupReservationStatus.Open;
        groupReservation.ReservationId = reservation.Id;

        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByTokenAsync(groupReservation.ReservationToken))
            .ReturnsAsync(groupReservation);

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _guestSessionRepositoryMock
            .Setup(r => r.CountByGroupReservationId(groupReservation.GroupReservationId))
            .ReturnsAsync(reservation.GuestCount);

        await Assert.ThrowsAsync<GuestLimitExceededException>(() => _service.GetGroupReservationByTokenAsync(groupReservation.ReservationToken));
    }

    [Theory]
    [AutoData]
    public async Task CloseGroupReservationAsync_ValidInput_UpdatesGroupReservationStatus(GroupReservation groupReservation)
    {
        _groupReservationRepositoryMock
            .Setup(r => r.GetByReservationIdAsync(groupReservation.ReservationId))
            .ReturnsAsync(groupReservation);

        GroupReservation? savedGroupReservation = null;
        _groupReservationRepositoryMock
            .Setup(r => r.SaveGroupReservationAsync(It.IsAny<GroupReservation>()))
            .Callback<GroupReservation>(r => savedGroupReservation = r);

        await _service.CloseGroupReservationAsync(groupReservation.ReservationId);

        Assert.NotNull(savedGroupReservation);
        Assert.Equal(GroupReservationStatus.Closed, savedGroupReservation.Status);
    }

    [Theory]
    [AutoData]
    public async Task CloseGroupReservationAsync_GroupReservationNotFound_DoesNotThrowException(string reservationId)
    {
        _groupReservationRepositoryMock
            .Setup(r => r.GetByReservationIdAsync(reservationId))
            .ReturnsAsync((GroupReservation?)null);

        await _service.CloseGroupReservationAsync(reservationId);
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationInviteTokenAsync_ValidInput_ReturnsToken(Reservation reservation, GroupReservation groupReservation)
    {
        reservation.Status = ReservationStatus.Reserved;
        reservation.GuestCount = 3;
        groupReservation.ReservationId = reservation.Id;
        groupReservation.Status = GroupReservationStatus.Open;

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _groupReservationRepositoryMock
            .Setup(r => r.GetByReservationIdAsync(reservation.Id))
            .ReturnsAsync(groupReservation);

        GetGroupInviteTokenResponse result = await _service.GetGroupReservationInviteTokenAsync(reservation.Id);

        Assert.Equal(groupReservation.ReservationToken, result.Token);
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationInviteTokenAsync_InvalidReservationId_ThrowsNotFound(string reservationId)
    {
        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservationId))
            .ReturnsAsync((Reservation?)null);

        await Assert.ThrowsAsync<ReservationNotFoundException>(() => _service.GetGroupReservationInviteTokenAsync(reservationId));
    }

    [Theory]
    [AutoData]
    public async Task GetGroupReservationInviteTokenAsync_OneGuest_ThrowsValidationException(Reservation reservation)
    {
        reservation.Status = ReservationStatus.Reserved;
        reservation.GuestCount = 1;

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        await Assert.ThrowsAsync<ValidationException>(() => _service.GetGroupReservationInviteTokenAsync(reservation.Id));
    }

    [Theory]
    [InlineAutoData(ReservationStatus.Completed)]
    [InlineAutoData(ReservationStatus.Cancelled)]
    [InlineAutoData(ReservationStatus.InProgress)]
    public async Task GetGroupReservationInviteTokenAsync_StatusIsNotReserved_ThrowsValidationException(ReservationStatus reservationStatus, Reservation reservation)
    {
        reservation.Status = reservationStatus;
        reservation.GuestCount = 1;

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        await Assert.ThrowsAsync<ValidationException>(() => _service.GetGroupReservationInviteTokenAsync(reservation.Id));
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    public async Task GetGroupReservationInviteTokenAsync_GroupStatusIsNotOpen_ThrowsException(GroupReservationStatus status, Type type, Reservation reservation, GroupReservation groupReservation)
    {
        reservation.Status = ReservationStatus.Reserved;
        reservation.GuestCount = 3;
        groupReservation.ReservationId = reservation.Id;
        groupReservation.Status = status;

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _groupReservationRepositoryMock
            .Setup(r => r.GetByReservationIdAsync(reservation.Id))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync(type, () => _service.GetGroupReservationInviteTokenAsync(reservation.Id));
    }

    // ---------- SubmitGroupPreOrderAsync ----------

    private static GuestSession CreateSession(bool isSubmitted, params (string DishId, int Quantity)[] dishes) => new()
    {
        Id = Guid.NewGuid().ToString(),
        GuestName = "Guest",
        GroupReservationId = "group",
        IsSubmitted = isSubmitted,
        Dishes = dishes.Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Quantity }).ToList(),
    };

    private void SetupSubmit(
        string userId,
        GroupReservation group,
        Reservation reservation,
        List<GuestSession> sessions,
        Order? order)
    {
        reservation.CustomerId = userId;
        group.ReservationId = reservation.Id;
        group.Status = GroupReservationStatus.Open;

        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByIdAsync(group.GroupReservationId))
            .ReturnsAsync(group);

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _guestSessionRepositoryMock
            .Setup(r => r.GetAllByGroupReservationIdAsync(group.GroupReservationId))
            .ReturnsAsync(sessions);

        _orderRepositoryMock
            .Setup(r => r.GetOrderByReservationIdAsync(reservation.Id))
            .ReturnsAsync(order);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_OwnerSession_KeepsSnapshotOfOwnerOrderAndIsNotMerged(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        order.Dishes = [new OrderItem { DishId = "dish1", Quantity = 7 }];

        var owner = CreateSession(true, ("dish5", 9));
        owner.IsOwnerSession = true;
        var sessions = new List<GuestSession> { owner, CreateSession(true, ("dish2", 1)) };

        SetupSubmit(userId, group, reservation, sessions, order);

        var result = await _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id);

        Assert.DoesNotContain(result, d => d.DishId == "dish5");
        Assert.Equal(7, order.Dishes.Single(d => d.DishId == "dish1").Quantity);
        Assert.Equal(1, order.Dishes.Single(d => d.DishId == "dish2").Quantity);

        var ownerDish = Assert.Single(owner.Dishes);
        Assert.Equal("dish1", ownerDish.DishId);
        Assert.Equal(7, ownerDish.Quantity);
        _guestSessionRepositoryMock.Verify(r => r.SaveAsync(owner), Times.Once);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_ValidInput_MergesSubmittedSessionsIntoOrder(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        order.Status = OrderStatus.Created;
        order.Dishes =
        [
            new OrderItem { DishId = "dish1", Quantity = 1 },
            new OrderItem { DishId = "dish3", Quantity = 1 },
        ];

        var sessions = new List<GuestSession>
        {
            CreateSession(true, ("dish1", 2), ("dish2", 1)),
            CreateSession(true, ("dish1", 1), ("dish2", 1)),
            CreateSession(false, ("dish9", 5)),
        };

        SetupSubmit(userId, group, reservation, sessions, order);

        var result = await _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id);

        Assert.Equal(2, result.Count);
        Assert.Equal(3, result.Single(d => d.DishId == "dish1").Quantity);
        Assert.Equal(2, result.Single(d => d.DishId == "dish2").Quantity);
        Assert.DoesNotContain(result, d => d.DishId == "dish9");

        Assert.Equal(OrderStatus.SubmittedByCustomer, order.Status);
        Assert.Equal(3, order.Dishes.Count);
        Assert.Equal(4, order.Dishes.Single(d => d.DishId == "dish1").Quantity);
        Assert.Equal(2, order.Dishes.Single(d => d.DishId == "dish2").Quantity);
        Assert.Equal(1, order.Dishes.Single(d => d.DishId == "dish3").Quantity);
        Assert.DoesNotContain(order.Dishes, d => d.DishId == "dish9");

        Assert.Equal(GroupReservationStatus.Submitted, group.Status);

        _orderRepositoryMock.Verify(r => r.SaveOrderAsync(order), Times.Once);
        _groupReservationRepositoryMock.Verify(r => r.SaveGroupReservationAsync(group), Times.Once);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_GroupNotFound_ThrowsGroupReservationNotFoundException(
        string userId,
        string groupReservationId,
        string reservationId)
    {
        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservationId))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(
            () => _service.SubmitGroupPreOrderAsync(userId, groupReservationId, reservationId));
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_ReservationNotFound_ThrowsReservationNotFoundException(
        string userId,
        GroupReservation group,
        string reservationId)
    {
        _groupReservationRepositoryMock
            .Setup(r => r.GetGroupReservationByIdAsync(group.GroupReservationId))
            .ReturnsAsync(group);

        _reservationRepositoryMock
            .Setup(r => r.GetReservationByIdAsync(reservationId))
            .ReturnsAsync((Reservation?)null);

        await Assert.ThrowsAsync<ReservationNotFoundException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservationId));
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_CallerIsNotOwner_ThrowsActionForbiddenException(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        SetupSubmit(userId, group, reservation, [CreateSession(true, ("dish1", 1))], order);
        reservation.CustomerId = "somebody-else";

        await Assert.ThrowsAsync<ActionForbiddenException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));

        _orderRepositoryMock.Verify(r => r.SaveOrderAsync(It.IsAny<Order>()), Times.Never);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_NoSubmittedSessions_ThrowsValidationException(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        var sessions = new List<GuestSession> { CreateSession(false, ("dish1", 1)) };
        SetupSubmit(userId, group, reservation, sessions, order);

        await Assert.ThrowsAsync<ValidationException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));

        _orderRepositoryMock.Verify(r => r.SaveOrderAsync(It.IsAny<Order>()), Times.Never);
        _groupReservationRepositoryMock.Verify(r => r.SaveGroupReservationAsync(It.IsAny<GroupReservation>()), Times.Never);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_SubmittedSessionsHaveNoDishes_ThrowsValidationException(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        var sessions = new List<GuestSession> { CreateSession(true), CreateSession(true) };
        SetupSubmit(userId, group, reservation, sessions, order);

        await Assert.ThrowsAsync<ValidationException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));

        _orderRepositoryMock.Verify(r => r.SaveOrderAsync(It.IsAny<Order>()), Times.Never);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_OrderNotFound_ThrowsValidationException(
        string userId,
        GroupReservation group,
        Reservation reservation)
    {
        SetupSubmit(userId, group, reservation, [CreateSession(true, ("dish1", 1))], order: null);

        await Assert.ThrowsAsync<ValidationException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));

        _groupReservationRepositoryMock.Verify(r => r.SaveGroupReservationAsync(It.IsAny<GroupReservation>()), Times.Never);
    }

    [Theory]
    [AutoData]
    public async Task SubmitGroupPreOrderAsync_ReservationDoesNotBelongToGroup_ThrowsValidationException(
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        SetupSubmit(userId, group, reservation, [CreateSession(true, ("dish1", 1))], order);
        group.ReservationId = "another-reservation";

        await Assert.ThrowsAsync<ValidationException>(
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    public async Task SubmitGroupPreOrderAsync_GroupIsNotOpen_ThrowsException(
        GroupReservationStatus status,
        Type expectedException,
        string userId,
        GroupReservation group,
        Reservation reservation,
        Order order)
    {
        SetupSubmit(userId, group, reservation, [CreateSession(true, ("dish1", 1))], order);
        group.Status = status;

        await Assert.ThrowsAsync(expectedException,
            () => _service.SubmitGroupPreOrderAsync(userId, group.GroupReservationId, reservation.Id));

        _orderRepositoryMock.Verify(r => r.SaveOrderAsync(It.IsAny<Order>()), Times.Never);
    }
}
