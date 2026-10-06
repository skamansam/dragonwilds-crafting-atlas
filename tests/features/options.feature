Feature: Graph options in the URL
  As someone sharing a configured view of the Crafting Atlas
  I want every graph option settable from the query string
  So that a link reproduces the sender's view without touching the recipient's settings

  Background:
    Given the option helper is loaded with the atlas kinds and these layouts

  # booleans — ?anim=0, ?anim=false, ?anim=off and a bare ?anim all work
  Scenario: A boolean option accepts the usual spellings
    When I parse the options "?anim=1&saved=true&worker=yes&auto=on"
    Then the parsed options are "anim=1; saved=1; worker=1; auto=1"

  Scenario: A boolean option accepts the off-spellings
    When I parse the options "?anim=0&saved=false&worker=no&auto=off"
    Then the parsed options are "anim=0; saved=0; worker=0; auto=0"

  Scenario: A bare flag means on
    When I parse the options "?orphans"
    Then the parsed option "orphans" is "1"

  Scenario: Turned-off options are honoured rather than treated as absent
    When I parse the options "?orphans=0&links=0&possessions=0"
    Then the parsed options are "orphans=0; links=0; possessions=0"

  # numbers — clamped and rounded to what the slider can express
  Scenario: A number option is clamped down to its range
    When I parse the options "?dens=999"
    Then the parsed option "dens" is "200"

  Scenario: A number option below its range is clamped up
    When I parse the options "?dens=10"
    Then the parsed option "dens" is "50"

  Scenario: A number option is rounded
    When I parse the options "?dens=137.6"
    Then the parsed option "dens" is "138"

  # what happens to nonsense in a shared link
  Scenario: An unusable value is dropped and reported
    When I parse the options "?layout=not-a-layout&dens=wide"
    Then the parsed options are empty
    And the unusable options are "layout; dens"

  Scenario: Unknown option names are ignored
    When I parse the options "?wobble=3&anim=0"
    Then the parsed option "anim" is "0"

  # layout and kind lists are validated against what the caller actually has
  Scenario: A layout option must be a known preset
    When I parse the options "?layout=grid"
    Then the parsed option "layout" is "grid"

  Scenario: The kinds option accepts a list
    When I parse the options "?cats=food,weapon&orphans=1"
    Then the parsed options are "cats=food,weapon; orphans=1"

  Scenario: The everything shorthand
    When I parse the options "?cats=all"
    Then the parsed option "cats" is "all"

  Scenario: The nothing shorthand
    When I parse the options "?cats=none"
    Then the parsed option "cats" is "none"

  Scenario: Unknown kinds are dropped from the list
    When I parse the options "?cats=food,bogus"
    Then the parsed option "cats" is "food"

  # isolation options
  Scenario: The isolation direction is an enum
    When I parse the options "?isodir=sideways"
    Then the parsed options are empty
    And the unusable options are "isodir"

  Scenario: The isolation depth takes a positive integer
    When I parse the options "?isodepth=3"
    Then the parsed option "isodepth" is "3"

  Scenario: An isolation depth of all means the whole tree
    When I parse the options "?isodepth=all"
    Then the parsed option "isodepth" is "all"

  Scenario: A zero isolation depth is rejected
    When I parse the options "?isodepth=0"
    Then the parsed options are empty
    And the unusable options are "isodepth"

  Scenario: The isolation target is a snake_case slug
    When I parse the options "?iso=iron_sword"
    Then the parsed option "iso" is "iron_sword"

  Scenario: A malformed isolation target is rejected
    When I parse the options "?iso=Iron Sword!"
    Then the unusable options are "iso"

  # nothing given means nothing overridden — the caller keeps its stored prefs
  Scenario: An empty query overrides nothing
    When I parse the options ""
    Then the parsed options are empty

  Scenario: A query with only foreign params overrides nothing
    When I parse the options "?tour=outputs"
    Then the parsed options are empty

  # building the URL back out — the whole state, in canonical order
  Scenario: The built query describes the entire option state
    When I build the options query for the whole state
    Then the built query contains "layout=elk-layered-wide; cats=all; possessions=1; isodepth=all"

  Scenario: An option without a value is omitted
    When I build the options query with no isolation
    Then the built query does not contain "iso="

  Scenario: The built query round-trips through the parser
    When I round-trip the whole option state
    Then the round-tripped options match the original state

  # the option list is the contract between the URL and the settings panel
  Scenario: The option set covers layout, legend and isolation
    When I list the option names
    Then the option names include "layout; cats; iso"
    And there are 16 option names
