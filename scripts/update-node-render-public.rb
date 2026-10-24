require 'json'
require_relative '../app/helpers/links_helper'
helper = Object.new.extend(LinksHelper)
path = File.expand_path('../services/wallpaper-api/src/rendering/metadata.json', __dir__)
metadata = JSON.parse(File.read(path))
metadata['lizard_descriptions'] = %w[ki taylor warren].to_h { |name| [name, [false, true].to_h { |mode| [mode.to_s, helper.lizard_to_description(name, mode)] }] }
metadata['inline_svgs'] = { 'wt.svg'=>File.read(File.expand_path('../app/assets/images/wt.svg', __dir__)) }
metadata['global_id_app'] = 'walltaker'
File.write(path, JSON.generate(metadata))
puts 'Updated public renderer assets and descriptions.'
