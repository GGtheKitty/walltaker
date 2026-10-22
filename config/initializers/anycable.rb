# Catch Action Cable features that cannot be executed by AnyCable before they
# reach production. This patch is intentionally limited to development/test so
# it does not add compatibility-check overhead to live channel commands.
require "anycable/rails/compatibility" unless Rails.env.production?
