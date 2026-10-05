Feature: Facility-aware trace inputs
  As a user tracing what I need to craft an item
  I want the crafting station (facility) to appear as a prerequisite when I trace inputs
  So that I know I need a Mystic Forge to make a Draconic Staff, and can trace what makes the Forge

  Background:
    Given the Crafting Atlas is loaded

  Scenario: Trace inputs from Draconic Staff surfaces the Mystic Forge facility
    Given item "Draconic Staff" is the trace root
    When I trace inputs 1 level
    Then the trace includes node "Mystic Forge"
    And the node "Mystic Forge" has kind "station"

  Scenario: Tracing Mystic Forge reveals its Build Menu inputs
    Given item "Mystic Forge" is the trace root
    When I trace inputs 1 level
    Then the trace includes node "Bronze Bar"
    And the trace includes node "Ash Logs"

  Scenario: Trace makes does not surface facilities
    Given item "Draconic Staff" is the trace root
    When I trace outputs 1 level
    Then the trace does not include node "Mystic Forge"
