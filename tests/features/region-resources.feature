Feature: Reading what a region holds off its own wiki page
  Every Ashenfall region and territory page carries a ==Resources== section
  listing what is gathered there. scripts/build-region-resources.mjs turns those
  into public/region-resources.js, the complement of the found-in overlay: it
  reads the *place* pages where found-in reads the *item* pages. The parsing and
  the title → node-id resolution are pure (scripts/region-resources-core.mjs),
  so they are driven directly here; the generator only adds the cache and the
  network, and the app folds the result into the region hubs.

  Background: the atlas the region pages are read against
    Given the atlas holds a tree, its logs and a coal node

  Scenario: A page's Resources list becomes members with a gather method
    Given a region page whose "Trees" section lists "[[Ash tree]]"
    When the region's resources are parsed
    Then the link "Ash tree" is a "chopped" resource

  Scenario: The headers the vault interiors use count too
    Given a region page whose "Loot" section is one level deeper and lists "[[Coal node]]"
    When the region's resources are parsed
    Then the link "Coal node" is a "chest" resource

  Scenario: An unfamiliar header falls back to found rather than guessing
    Given a region page whose "Things" section lists "[[Ash tree]]"
    When the region's resources are parsed
    Then the link "Ash tree" is a "other" resource

  Scenario: Prose and templates under a header contribute nothing
    Given a region page whose "Trees" section lists "[[Ash tree]]"
    And the line "There are no ash trees here; these are picked up off the ground." sits under "Trees"
    When the region's resources are parsed
    Then the page yields 1 links

  Scenario: Markup links are not resources
    Given a region page whose "Trees" section lists "[[Ash tree]]"
    And the line "[[File:Temple Woods.png|thumb]]" sits under "Trees"
    When the region's resources are parsed
    Then the page yields 1 links

  Scenario: Two links on one bullet both count, and a piped link keeps its page
    Given a region page whose "Nodes" section lists "[[Coal node]]"
    And the bullet "[[Coal node]] {{*}} ([[Ash logs|Ash logs there]])" sits under "Nodes"
    When the region's resources are parsed
    Then the page yields 3 links
    And the link "Ash logs" is its own page with the label "Ash logs there"

  Scenario: A page with no Resources section contributes no members
    Given a region page with no Resources section
    When the region's resources are parsed
    Then the page yields 0 links

  Scenario: Case and underscores do not decide a match
    Given a region page whose "Trees" section lists "[[ash_tree]]"
    When the page's links are resolved for "Temple Woods"
    Then "ash tree" resolves to "Ash Tree"

  Scenario: A disambiguated page title resolves to the node behind it
    Given an atlas holding "Flax" of kind "material"
    And a region page whose "Plants" section lists "[[Flax (plant)]]"
    When the page's links are resolved for "Temple Woods"
    Then "Flax (plant)" resolves to "Flax"

  Scenario: The page title beats the display label
    Given a region page whose "Trees" section lists "[[Ash tree|Ash logs]]"
    When the page's links are resolved for "Temple Woods"
    Then "Ash tree" resolves to "Ash Tree"

  Scenario: A wiki redirect resolves to the node it points at
    Given the wiki redirects "Coal deposit" to "Coal Node"
    And a region page whose "Nodes" section lists "[[Coal deposit]]"
    When the page's links are resolved for "Temple Woods"
    Then "Coal deposit" resolves to "Coal Node"

  Scenario: A link the atlas has no node for is reported, never invented
    Given a region page whose "Other" section lists "[[Sanguine Urn]]"
    When the page's links are resolved for "Temple Woods"
    Then "Sanguine Urn" is reported unresolved

  Scenario: A link to a quest is skipped, not drawn as a find
    Given an atlas holding "Heartstrings" of kind "quest"
    And a region page whose "Other" section lists "[[Heartstrings]]"
    When the page's links are resolved for "Temple Woods"
    Then "Heartstrings" is skipped as a "quest"

  Scenario: The same item in two sections carries both gather methods
    Given a region page whose "Nodes" section lists "[[Ash tree]]"
    And the bullet "[[Ash tree]]" sits under "Trees"
    When the page's links are resolved for "Temple Woods"
    Then "Temple Woods" holds "Ash Tree" with the methods "mined,chopped"

  Scenario: A page with no Resources heading is a stub, a page we could not read is unknown
    Given a region page with no Resources section
    When the canonical regions are split by their pages
    Then the stub pages are "Temple Woods"
    And the unknown pages are "The Burning Spire"

  Scenario: A page that has the heading is never a stub, however little it resolves
    Given a region page whose "Other" section lists "[[Sanguine Urn]]"
    When the canonical regions are split by their pages
    Then the stub pages are ""
    And the unknown pages are ""

  Scenario: Two regions keep their own members
    Given a region page whose "Trees" section lists "[[Ash tree]]"
    When the page's links are resolved for "Temple Woods"
    And a region page whose "Nodes" section lists "[[Coal node]]"
    And the page's links are resolved for "Ghornfell"
    Then "Temple Woods" holds "Ash Tree" with the methods "chopped"
    And "Temple Woods" does not hold "Coal Node"
    And "Ghornfell" holds both "Ash Tree" and "Coal Node"
    And "Temple Woods" has 1 members and "Ghornfell" has 2
