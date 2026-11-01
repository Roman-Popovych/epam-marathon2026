# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
    -  Group pre-order: owner endpoints
    -  `GET /guest/groups/{groupReservationId}/sessions` - participants of the group with dishes, subtotals and total
    -  `GET /reservations/{reservationId}/guest-session-id` - owner guest session id (created on first request)
    -  `POST /group-reservations/{groupReservationId}/submit` - consolidated group pre-order (merge by dishId, order -> SubmittedByCustomer, group -> Submitted)

### Changed
    -  `DELETE /guest/groups/{groupReservationId}/sessions/{guestSessionId}` now returns camelCase JSON; participants snapshot is shared with the GET endpoint
    -  Owner session is no longer counted as a joined guest in guest limit and participant count

## [1.0.0] - yyyy-MM-dd
### Added
    -  Added items

### Changed
    -  Changed items 

### Removed
    -  Removed items 
