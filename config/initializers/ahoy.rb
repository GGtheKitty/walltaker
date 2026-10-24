class Ahoy::Store < Ahoy::DatabaseStore
  %i[track_visit track_event authenticate visit geocode].each do |operation|
    define_method(operation) do |*args|
      if NodeActivityBackend.enabled?
        @node_activity_store ||= NodeActivityStore.new(@options)
        @node_activity_store.public_send(operation, *args)
      else
        super(*args)
      end
    end
  end
end

# set to true for JavaScript tracking
Ahoy.api = false

# set to true for geocoding (and add the geocoder gem to your Gemfile)
# we recommend configuring local geocoding as well
# see https://github.com/ankane/ahoy#geocoding
Ahoy.geocode = false

Ahoy.exclude_method = lambda do |controller, request|
  request.path.start_with?('/api', '/_internal/', '/_anycable') || request.path == '/up'
end
