Feature: URL routing (hash deep links)
  As someone sharing a link to the Crafting Atlas
  I want snake_case item ids in a hash route
  So that #/ash_logs selects Ash Logs and #/ash_logs/iron_sword draws that path

  Background:
    Given the routing helpers are loaded

  # slug rules (src/routing.js slug)
  Scenario: A display name becomes a snake_case slug
    When I slug the name "Iron Sword"
    Then the slug is "iron_sword"

  Scenario: Apostrophes are dropped from a slug
    When I slug the name "Adventurer's Tunic"
    Then the slug is "adventurers_tunic"

  Scenario: Ampersands spell out as "and"
    When I slug the name "Beef & Tomato Stew"
    Then the slug is "beef_and_tomato_stew"

  Scenario: A colon and its spaces collapse to one underscore
    When I slug the name "PLAN: Wooden Barrel"
    Then the slug is "plan_wooden_barrel"

  Scenario: Parentheses are flattened into the slug
    When I slug the name "Clay Vessel (Unfired)"
    Then the slug is "clay_vessel_unfired"

  # single quotes delimit the value here because the name itself carries " "
  Scenario: Double quotes are dropped from a slug
    When I slug the name 'Goblin "Swingslash"'
    Then the slug is "goblin_swingslash"

  # index over the real dataset
  Scenario: Every item round-trips through its own slug
    Given the routing index is built from the atlas data
    Then every node slug resolves back to that node

  Scenario: Colliding names get a numeric suffix
    Given the routing index is built from the atlas data
    Then the colliding names resolve to different ids

  # hash parsing (src/routing.js parseHash)
  Scenario: A one-item hash selects that item
    When I parse the hash "#/ash_logs"
    Then the route segment count is 1
    And the first segment is "ash_logs"

  Scenario: A two-item hash routes a path
    When I parse the hash "#/ash_logs/iron_sword"
    Then the route segment count is 2
    And the second segment is "iron_sword"

  Scenario: An empty hash routes nowhere
    When I parse the hash ""
    Then the route segment count is 0

  Scenario: A bare slash hash routes nowhere
    When I parse the hash "#/"
    Then the route segment count is 0

  Scenario: Segments are lower-cased and a trailing slash ignored
    When I parse the hash "#/Ash_Logs/"
    Then the route segment count is 1
    And the first segment is "ash_logs"

  Scenario: A full URL parses like a bare fragment
    When I parse the hash "https://example.com/atlas/#/ash_logs/iron_sword"
    Then the route segment count is 2
    And the first segment is "ash_logs"

  # round trips (buildHash → parseHash → index)
  Scenario: A selection slug round-trips back to its item
    Given the routing index is built from the atlas data
    When I build a route for "Iron Sword"
    Then parsing that route selects "Iron Sword"

  Scenario: A path slug round-trips back to both items
    Given the routing index is built from the atlas data
    When I build a route for "Ash Logs" and "Iron Sword"
    Then parsing that route selects "Ash Logs" then "Iron Sword"
