Feature: Facility-aware highlight requires
  As a user exploring what I need to craft an item
  I want the crafting station (facility) to appear as a prerequisite when I show requires
  So that I know I need a Mystic Forge to make a Draconic Staff, and can expand what makes the Forge

  Background:
    Given the Crafting Atlas is loaded

  Scenario: Requires from Draconic Staff surfaces the Mystic Forge facility
    Given item "Draconic Staff" is the highlight root
    When I expand requires 1 level
    Then the highlight includes node "Mystic Forge"
    And the node "Mystic Forge" has kind "station"

  Scenario: Expanding Mystic Forge reveals its Build Menu inputs
    Given item "Mystic Forge" is the highlight root
    When I expand requires 1 level
    Then the highlight includes node "Bronze Bar"
    And the highlight includes node "Ash Logs"

  Scenario: Enables does not surface facilities
    Given item "Draconic Staff" is the highlight root
    When I expand enables 1 level
    Then the highlight does not include node "Mystic Forge"
