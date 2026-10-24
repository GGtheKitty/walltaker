# Ahoy retains its cookie/request integration and user-agent parser. All visit
# lookup, persistence, authentication attribution and event storage use Node.
class NodeActivityStore < Ahoy::DatabaseStore
  def track_visit(data)
    attributes = data.merge(started_at: data.fetch(:started_at).iso8601(6))
    assign_document(NodeActivityBackend.request('visit-create', data: NodeActivityBackend.safe_properties(attributes)))
  end

  def visit
    return @visit if defined?(@visit)
    return nil if request&.path&.start_with?('/_internal/', '/_anycable')
    assign_document(NodeActivityBackend.request('visit', proof))
  end

  def track_event(data)
    current = visit_or_create(started_at: data[:time])
    return unless current&.id
    NodeActivityBackend.request('event-create', proof.merge(
      request_key: "event:#{data.fetch(:event_id)}", user_id: data[:user_id], name: data.fetch(:name),
      properties: NodeActivityBackend.safe_properties(data[:properties] || {}), time: data.fetch(:time).iso8601(6)
    ))
  end

  def authenticate(data)
    return unless data[:user_id]
    assign_document(NodeActivityBackend.request('visit-authenticate', proof.merge(user_id: data.fetch(:user_id))))
  end

  def geocode(*)
    # Geocoding is disabled in this application.
  end

  private

  def proof
    { visit_token: ahoy.visit_token, visitor_token: ahoy.visitor_token, ip: request&.remote_ip }
  end

  def assign_document(result)
    attributes = result['visit']
    # A missing/forged cookie must not bypass a ban on the current request IP.
    attributes ||= { 'ip' => request&.remote_ip } if result['ban']
    if attributes
      if defined?(@visit) && @visit && @visit.id == attributes['id']&.to_i
        @visit.assign_attributes(attributes)
      else
        @visit = Ahoy::Visit.instantiate(attributes)
      end
      @visit.association(:banned_ip).target = result['ban'] && BannedIp.instantiate(result.fetch('ban'))
    else
      @visit = nil
    end
    @visit
  end
end
