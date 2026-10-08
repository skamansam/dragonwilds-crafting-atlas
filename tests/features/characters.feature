Feature: Per-character graph state and skill levels
  Every character keeps its own graph state — the chosen layout, the graph and
  legend settings, the owned-item ledger, plans and highlights — plus one level per
  skill. The total shown beside a character's name is the sum of all its skill
  levels. The atlas asks for a character once and then remembers.

  Background:
    Given a fresh browser store

  Scenario: A new character starts at level 1 in every skill
    When I create a character named "Alice"
    Then the level in "Artisan" is 1
    And the total level is 12

  Scenario: Raising a skill level raises the total
    When I create a character named "Alice"
    And I set the level in "Artisan" to 20
    Then the level in "Artisan" is 20
    And the total level is 31

  Scenario: A level above the maximum is clamped
    When I create a character named "Alice"
    And I set the level in "Artisan" to 200
    Then the level in "Artisan" is 99
    And the total level is 110

  Scenario: A level below the minimum is raised to the minimum
    When I create a character named "Alice"
    And I set the level in "Mining" to -5
    Then the level in "Mining" is 1

  Scenario: A blank name falls back to a default
    When I create a character named ""
    Then the active character is named "Adventurer"

  Scenario: Each character keeps its own graph state
    When I create a character named "Alice"
    And I set the live layout to "grid"
    And I mark "Iron Sword" as owned
    And I also create a character named "Bob"
    Then no live layout is chosen
    And the owned ledger is empty
    When I switch to the character named "Alice"
    Then the live layout is "grid"
    And the owned ledger contains "Iron Sword"

  Scenario: The force-directed toggle follows the character
    When I create a character named "Alice"
    And I turn the force-directed toggle off
    And I also create a character named "Bob"
    Then no force-directed preference is stored
    When I switch to the character named "Alice"
    Then the force-directed toggle is off

  Scenario: Creating a character can adopt the existing saved data
    Given the saved layout is "grid"
    And the saved ledger contains "Iron Sword"
    When adopting the current data, I create a character named "Alice"
    Then the live layout is "grid"
    And the owned ledger contains "Iron Sword"
    When starting clean, I create a character named "Bob"
    Then no live layout is chosen
    And the owned ledger is empty

  Scenario: Deleting the active character falls back to another
    When I create a character named "Alice"
    And I also create a character named "Bob"
    When I delete the active character
    Then the active character is named "Alice"

  Scenario: Corrupt or duplicate roster entries are dropped
    Given a roster with a duplicate id and a nameless character
    Then the roster holds only the valid characters

  Scenario: The prompt is remembered once answered
    Then the character prompt has not been shown
    When I mark the character prompt as shown
    Then the character prompt has been shown
