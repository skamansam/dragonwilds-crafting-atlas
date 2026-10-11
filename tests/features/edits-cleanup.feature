Feature: Cleaning up local data edits after the dataset moves
  Corrections are saved in the browser (dw.edits) and never touch the shipped
  files. Once the dataset moves, two kinds of saved edit are worth offering to
  drop: the ones the atlas now ships identically (a duplicate), and the ones
  overriding a row the dataset has changed underneath (a stale override).
  The classification is pure — src/edits.js's classifyEdits — so it can be
  driven directly; src/cleanup.js only owns the dialog.

  Background: a bundled "Iron Bar" that says "Processed Material"
    Given the dataset ships "Iron Bar" with itemType "Processed Material"

  Scenario: An edit the dataset now ships is a duplicate
    Given an edit setting "Iron Bar" itemType to "Processed Material"
    When the edits are classified
    Then "Iron Bar" is listed as a duplicate
    And "Iron Bar" is not listed as overriding an update

  Scenario: An edit overriding a row the dataset has changed
    Given an edit setting "Iron Bar" itemType to "Bar"
    And that edit was saved when the dataset said "Old Type"
    When the edits are classified
    Then "Iron Bar" is listed as overriding an update
    And "Iron Bar" is not listed as a duplicate

  Scenario: An edit the dataset has left alone is neither
    Given an edit setting "Iron Bar" itemType to "Bar"
    And that edit was saved when the dataset said "Processed Material"
    When the edits are classified
    Then neither list mentions "Iron Bar"

  Scenario: An edit with no recorded baseline is never called stale
    Given an edit setting "Iron Bar" itemType to "Bar"
    When the edits are classified
    Then neither list mentions "Iron Bar"

  Scenario: An edit to a node the dataset no longer ships is ignored
    Given an edit setting "Gone Bar" itemType to "Bar"
    When the edits are classified
    Then neither list mentions "Gone Bar"
