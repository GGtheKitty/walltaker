#!/usr/bin/env ruby
# Build-time only: parse the existing ERB view language into a versioned AST.
# Production rendering executes in Node; it never invokes Ruby or evals input.
require 'ripper'
require 'json'
require 'action_view'
require 'action_view/template/handlers/erb/erubi'
root = File.expand_path('..', __dir__)
def normalize_ast(ast, ruby)
  strings = {}; quotes = []
  Ripper.lex(ruby).each do |position, event, value, _state|
    case event
    when :on_tstring_beg, :on_qwords_beg, :on_qsymbols_beg
      quotes << (value == "'" || value.start_with?('%q', '%w', '%i') ? :single : :double)
    when :on_regexp_beg then quotes << :regexp
    when :on_tstring_end, :on_regexp_end then quotes.pop
    when :on_tstring_content
      if quotes.last == :single
        strings[position] = value.gsub(/\\([\\'])/, '\\1')
      elsif quotes.last == :double
        escapes = { 'n'=>"\n", 'r'=>"\r", 't'=>"\t", 'b'=>"\b", 'f'=>"\f", 'v'=>"\v", 'a'=>"\a", 'e'=>"\e", 's'=>' ', '"'=>'"', "\\"=>"\\", '#'=>'#' }
        strings[position] = value.gsub(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/) do
          code = Regexp.last_match(1)
          code.start_with?('u', 'x') ? [code[1..].to_i(16)].pack('U') : escapes.fetch(code, "\\" + code)
        end
      end
    end
  end
  transform = lambda do |node|
    return node unless node.is_a?(Array)
    if node.first == :@tstring_content && strings.key?(node[2])
      [:@string, strings.fetch(node[2])]
    elsif node.first.to_s.start_with?('@')
      node.first(2)
    else
      node.map { |child| transform.call(child) }
    end
  end
  transform.call(ast)
end
views = {}
local_defaults = {}
errors = []
[File.join(root, 'app/views'), File.join(root, 'nuttracker/app/views')].each do |directory|
  (Dir[File.join(directory, '**/*.erb')] + Dir[File.join(directory, '**/*.jbuilder')]).sort.each do |file|
    name = file.delete_prefix(directory + '/')
    source = File.read(file)
    ruby = file.end_with?('.jbuilder') ? source : ActionView::Template::Handlers::ERB::Erubi.new(source, escape: true).src
    parsed = Ripper.sexp("def node_template
#{ruby}
end")
    ast = parsed && parsed[1][0][3]
    if ast
      views[name] = normalize_ast(ast, "def node_template\n#{ruby}\nend")
      if (signature = source.match(/<%#\s*locals:\s*\(([^\n]*?)\)/))
        declaration = "def node_template(#{signature[1]}); end"
        parameters = Ripper.sexp(declaration).dig(1, 0, 2, 1, 5) || []
        local_defaults[name] = parameters.filter_map do |label, expression|
          [label[1].delete_suffix(':'), normalize_ast(expression, declaration)] unless expression == false
        end.to_h
      end
    else
      errors << name
    end
  end
end
abort "Invalid ERB syntax: #{errors.join(', ')}" unless errors.empty?
output = ARGV.first || File.join(root, 'services/wallpaper-api/src/rendering/views.json')
temporary = output + '.tmp-' + Process.pid.to_s
File.write(temporary, JSON.generate({version: 1, templates: views, local_defaults:}))
File.rename(temporary, output)
warn "Compiled #{views.length} templates for native Node rendering."
