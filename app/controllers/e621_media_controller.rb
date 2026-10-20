require 'net/http'

class E621MediaController < ActionController::Base
  include ActionController::Live

  FORWARDED_RESPONSE_HEADERS = %w[
    Accept-Ranges
    Content-Length
    Content-Range
    Content-Type
    ETag
    Last-Modified
  ].freeze

  def show
    uri = E621MediaProxy.resolve(params[:token])
    return head :not_found if uri.nil?

    proxy(uri)
  rescue IOError, Errno::ECONNRESET
    # The client disconnected while the response was streaming.
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError => error
    Rails.logger.warn("e621 media proxy failed: #{error.class}: #{error.message}")
    head :bad_gateway unless response.committed?
  ensure
    response.stream.close
  end

  private

  def proxy(uri)
    upstream_request = request.head? ? Net::HTTP::Head.new(uri) : Net::HTTP::Get.new(uri)
    upstream_request['User-Agent'] = SiteConfig.e621_user_agent
    upstream_request['Referer'] = 'https://e621.net/'
    upstream_request['Range'] = request.headers['Range'] if request.headers['Range'].present?
    upstream_request['If-Range'] = request.headers['If-Range'] if request.headers['If-Range'].present?

    Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 30) do |http|
      http.request(upstream_request) do |upstream_response|
        self.status = upstream_response.code.to_i

        unless upstream_response.is_a?(Net::HTTPSuccess) || upstream_response.is_a?(Net::HTTPPartialContent)
          response.headers['Content-Type'] = 'text/plain'
          response.stream.write('Upstream media request failed.') unless request.head?
          next
        end

        copy_response_headers(upstream_response)
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        response.headers['Content-Disposition'] = 'inline'
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
        upstream_response.read_body { |chunk| response.stream.write(chunk) } unless request.head?
      end
    end
  end

  def copy_response_headers(upstream_response)
    FORWARDED_RESPONSE_HEADERS.each do |header|
      value = upstream_response[header]
      response.headers[header] = value if value.present?
    end
  end
end
